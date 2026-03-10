/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║           MOLTY ROYALE BOT DASHBOARD (Web-based)             ║
 * ║              Management Console for Multiple Agents          ║
 * ╚══════════════════════════════════════════════════════════════╝
 * 
 * How to use:
 *   1. npm install
 *   2. node dashboard.js
 *   3. Open browser to http://localhost:3000
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// ══════════════════════════════════════════════════════════════
//  CONFIGURATION
// ══════════════════════════════════════════════════════════════

const PORT = process.env.DASHBOARD_PORT || 3000;
const AGENTS_DIR = path.join(__dirname, process.env.AGENTS_DIR || 'agents');
const CONFIG_PATH = path.join(__dirname, 'dashboard_config.json');
const ALLOWED_MODES = ['safe', 'balanced', 'brutal', 'brutals'];

const DEFAULT_CONFIG = {
    pythonCommand: 'node',
    agentScript: 'agent.js',
    agentsDir: 'agents',
    restartDelay: 5,
    staggerSeconds: 2,
    restartAlways: false,
    defaultMode: 'balanced',
};

// ══════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════

function loadJson(filePath, defaultData) {
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            return { ...defaultData, ...data };
        }
    } catch (e) {
        console.error(`Error loading ${filePath}:`, e.message);
    }
    return { ...defaultData };
}

function saveJson(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error(`Error saving ${filePath}:`, e.message);
        return false;
    }
}

function parseEnvFile(filePath) {
    const data = {};
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            for (const line of content.split('\n')) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                    const [key, ...valueParts] = trimmed.split('=');
                    const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
                    data[key.trim()] = value;
                }
            }
        }
    } catch (e) {
        console.error(`Error parsing ${filePath}:`, e.message);
    }
    return data;
}

function saveEnvFile(filePath, data) {
    try {
        const lines = Object.entries(data).map(([key, value]) => {
            const needsQuotes = /\s|#/.test(value);
            const formattedValue = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
            return `${key}=${formattedValue}`;
        });
        fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
        return true;
    } catch (e) {
        console.error(`Error saving ${filePath}:`, e.message);
        return false;
    }
}

function normalizeMode(value, defaultValue = 'balanced') {
    const mode = String(value || defaultValue).trim().toLowerCase();
    return ALLOWED_MODES.includes(mode) ? mode : (ALLOWED_MODES.includes(defaultValue) ? defaultValue : 'balanced');
}

// ══════════════════════════════════════════════════════════════
//  AGENT MANAGER
// ══════════════════════════════════════════════════════════════

class AgentManager {
    constructor() {
        this.agents = new Map();
        this.config = loadJson(CONFIG_PATH, DEFAULT_CONFIG);
        this.logs = new Map();
        this.maxLogLines = 500;
    }

    loadAgents() {
        const agentsDir = path.join(__dirname, this.config.agentsDir);
        
        // Create agents directory if not exists
        if (!fs.existsSync(agentsDir)) {
            fs.mkdirSync(agentsDir, { recursive: true });
        }

        const files = fs.readdirSync(agentsDir);
        const envFiles = files.filter(f => f.endsWith('.env'));

        for (const envFile of envFiles) {
            const envPath = path.join(agentsDir, envFile);
            const values = parseEnvFile(envPath);
            const name = values.AGENT_NAME || path.basename(envFile, '.env');
            const mode = normalizeMode(values.AGGRO_MODE, this.config.defaultMode);
            const apiKeyPresent = !!values.API_KEY;

            this.agents.set(name, {
                name,
                envPath,
                envFile,
                apiKeyPresent,
                mode,
                values,
                process: null,
                status: 'Stopped',
                pid: '-',
                restarts: 0,
                lastExitCode: null,
                startedAt: null,
                stats: { wins: 0, losses: 0, balance: null },
            });
        }

        return this.agents.size;
    }

    getAgent(name) {
        return this.agents.get(name);
    }

    getAllAgents() {
        return Array.from(this.agents.values()).map(a => ({
            name: a.name,
            mode: a.mode,
            apiKeyPresent: a.apiKeyPresent,
            status: a.status,
            pid: a.pid,
            restarts: a.restarts,
            lastExitCode: a.lastExitCode,
            envFile: a.envFile,
            startedAt: a.startedAt,
            stats: a.stats,
        }));
    }

    addLog(agentName, message) {
        if (!this.logs.has(agentName)) {
            this.logs.set(agentName, []);
        }
        const logs = this.logs.get(agentName);
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        logs.push({ timestamp, message });
        
        // Trim logs
        if (logs.length > this.maxLogLines) {
            logs.shift();
        }
    }

    getLogs(agentName, limit = 100) {
        const logs = this.logs.get(agentName) || [];
        return logs.slice(-limit);
    }

    clearLogs(agentName) {
        if (agentName) {
            this.logs.set(agentName, []);
        } else {
            this.logs.clear();
        }
    }

    startAgent(name) {
        const agent = this.agents.get(name);
        if (!agent) return { success: false, error: 'Agent not found' };
        if (agent.process) return { success: false, error: 'Already running' };
        if (!agent.apiKeyPresent) return { success: false, error: 'API_KEY missing' };

        const scriptPath = path.join(__dirname, this.config.agentScript);
        if (!fs.existsSync(scriptPath)) {
            return { success: false, error: `Script not found: ${scriptPath}` };
        }

        const env = { ...process.env, ...agent.values };
        env.AGGRO_MODE = normalizeMode(agent.mode, this.config.defaultMode);
        env.PYTHONIOENCODING = 'utf-8';
        env.PYTHONUTF8 = '1';

        try {
            const proc = spawn(this.config.pythonCommand, [scriptPath], {
                cwd: __dirname,
                env,
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            agent.process = proc;
            agent.status = 'Starting';
            agent.startedAt = Date.now();
            agent.pid = String(proc.pid);

            this.addLog(name, `🚀 Start: ${this.config.pythonCommand} ${this.config.agentScript}`);

            // Handle stdout
            proc.stdout.on('data', (data) => {
                const text = data.toString('utf-8').trim();
                for (const line of text.split('\n')) {
                    if (line) {
                        this.addLog(name, line);
                        this._parseStats(name, line);
                    }
                }
            });

            // Handle stderr
            proc.stderr.on('data', (data) => {
                const text = data.toString('utf-8').trim();
                for (const line of text.split('\n')) {
                    if (line) {
                        this.addLog(name, `[ERR] ${line}`);
                    }
                }
            });

            // Handle exit
            proc.on('close', (code) => {
                agent.lastExitCode = code;
                agent.process = null;
                agent.startedAt = null;

                const wasUserStop = agent.status === 'Stopping';
                agent.status = wasUserStop ? 'Stopped' : (code === 0 ? 'Exited' : 'Crashed');

                this.addLog(name, `♻️ Exit code ${code}. ${wasUserStop ? 'Stopped by user.' : 'Process ended.'}`);

                // Auto-restart
                if (!wasUserStop && (this.config.restartAlways || code !== 0)) {
                    agent.restarts++;
                    agent.status = `Restarting (${this.config.restartDelay}s)`;
                    this.addLog(name, `♻️ Auto-restart in ${this.config.restartDelay} seconds...`);
                    
                    setTimeout(() => {
                        if (agent.status.startsWith('Restarting')) {
                            this.startAgent(name);
                        }
                    }, this.config.restartDelay * 1000);
                }

                this._broadcastUpdate();
            });

            agent.status = 'Running';
            this._broadcastUpdate();
            return { success: true };

        } catch (e) {
            agent.status = 'Error';
            agent.process = null;
            this.addLog(name, `❌ Failed to start: ${e.message}`);
            this._broadcastUpdate();
            return { success: false, error: e.message };
        }
    }

    stopAgent(name) {
        const agent = this.agents.get(name);
        if (!agent) return { success: false, error: 'Agent not found' };
        if (!agent.process) return { success: false, error: 'Not running' };

        agent.status = 'Stopping';
        this.addLog(name, '⏹️ Stopping process...');

        try {
            // Try graceful shutdown
            agent.process.kill('SIGTERM');
            
            // Force kill after timeout
            setTimeout(() => {
                if (agent.process) {
                    try {
                        agent.process.kill('SIGKILL');
                    } catch (e) {
                        // Already dead
                    }
                }
            }, 5000);

            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    startAllAgents() {
        const results = [];
        let staggerDelay = 0;

        for (const [name, agent] of this.agents) {
            if (!agent.apiKeyPresent) {
                results.push({ name, success: false, error: 'API_KEY missing' });
                continue;
            }

            setTimeout(() => {
                this.startAgent(name);
            }, staggerDelay * 1000);

            results.push({ name, success: true, scheduled: true });
            staggerDelay += this.config.staggerSeconds;
        }

        return results;
    }

    stopAllAgents() {
        const results = [];
        for (const [name] of this.agents) {
            results.push(this.stopAgent(name));
        }
        return results;
    }

    setAgentMode(name, mode) {
        const agent = this.agents.get(name);
        if (!agent) return { success: false, error: 'Agent not found' };

        const normalizedMode = normalizeMode(mode);
        agent.mode = normalizedMode;
        agent.values.AGGRO_MODE = normalizedMode;

        if (saveEnvFile(agent.envPath, agent.values)) {
            this.addLog(name, `⚙️ Mode set to '${normalizedMode}'`);
            if (agent.process) {
                this.addLog(name, 'ℹ️ Restart agent for mode change to take effect');
            }
            this._broadcastUpdate();
            return { success: true };
        }

        return { success: false, error: 'Failed to save .env file' };
    }

    setAllAgentsMode(mode) {
        const results = [];
        const normalizedMode = normalizeMode(mode);

        for (const [name] of this.agents) {
            results.push(this.setAgentMode(name, normalizedMode));
        }

        return results;
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        return saveJson(CONFIG_PATH, this.config);
    }

    _parseStats(agentName, message) {
        const agent = this.agents.get(agentName);
        if (!agent) return;

        // Parse W/L
        const wlMatch = message.match(/\bW\s*:\s*(\d+)\s+L\s*:\s*(\d+)\b/i);
        if (wlMatch) {
            agent.stats.wins = parseInt(wlMatch[1], 10);
            agent.stats.losses = parseInt(wlMatch[2], 10);
            this._broadcastUpdate();
        }

        // Parse Wins
        const winsMatch = message.match(/\bWins\s*:\s*(\d+)\b/i);
        if (winsMatch) {
            agent.stats.wins = parseInt(winsMatch[1], 10);
            this._broadcastUpdate();
        }

        // Parse Losses
        const lossesMatch = message.match(/\bLosses\s*:\s*(\d+)\b/i);
        if (lossesMatch) {
            agent.stats.losses = parseInt(lossesMatch[2], 10);
            this._broadcastUpdate();
        }

        // Parse Balance
        const balanceMatch = message.match(/Moltz Balance awal\s*:\s*([+-]?[\d.,]+)/i) ||
                            message.match(/\bMoltz\s*:\s*([+-]?[\d.,]+)/i);
        if (balanceMatch) {
            const balance = parseFloat(balanceMatch[1].replace(/,/g, ''));
            if (!isNaN(balance)) {
                agent.stats.balance = balance;
                this._broadcastUpdate();
            }
        }
    }

    _broadcastUpdate() {
        // Will be implemented with WebSocket
    }

    setWebSocket(wss) {
        this.wss = wss;
        this._broadcastUpdate = () => {
            if (this.wss) {
                const update = {
                    type: 'update',
                    agents: this.getAllAgents(),
                };
                for (const client of this.wss.clients) {
                    if (client.readyState === 1) {
                        client.send(JSON.stringify(update));
                    }
                }
            }
        };
    }
}

// ══════════════════════════════════════════════════════════════
//  EXPRESS SERVER
// ══════════════════════════════════════════════════════════════

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const agentManager = new AgentManager();
agentManager.setWebSocket(wss);

// Middleware
app.use(express.json());

// Serve static files (HTML/CSS/JS)
const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Molty Royale Bot Dashboard</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: #1a1a2e;
            color: #eee;
            min-height: 100vh;
        }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        h1 { font-size: 24px; margin-bottom: 10px; }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .summary-card {
            background: rgba(255,255,255,0.1);
            padding: 15px;
            border-radius: 8px;
            text-align: center;
        }
        .summary-card h3 { font-size: 14px; opacity: 0.8; margin-bottom: 5px; }
        .summary-card .value { font-size: 28px; font-weight: bold; }
        .controls {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 20px;
            padding: 15px;
            background: #16213e;
            border-radius: 10px;
        }
        button {
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s;
        }
        button:hover { transform: translateY(-1px); }
        button:active { transform: translateY(0); }
        .btn-primary { background: #667eea; color: white; }
        .btn-success { background: #10b981; color: white; }
        .btn-danger { background: #ef4444; color: white; }
        .btn-warning { background: #f59e0b; color: white; }
        .btn-secondary { background: #4b5563; color: white; }
        select, input {
            padding: 10px;
            border: 1px solid #374151;
            border-radius: 6px;
            background: #1f2937;
            color: #eee;
            font-size: 14px;
        }
        .agent-table {
            width: 100%;
            border-collapse: collapse;
            background: #16213e;
            border-radius: 10px;
            overflow: hidden;
            margin-bottom: 20px;
        }
        .agent-table th, .agent-table td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #1f2937;
        }
        .agent-table th { background: #0f3460; font-weight: 600; }
        .agent-table tr:hover { background: #1f2937; }
        .status-badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 500;
        }
        .status-running { background: #10b981; color: white; }
        .status-stopped { background: #6b7280; color: white; }
        .status-error { background: #ef4444; color: white; }
        .status-starting { background: #3b82f6; color: white; }
        .status-restarting { background: #f59e0b; color: white; }
        .status-exited { background: #8b5cf6; color: white; }
        .logs-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 15px;
        }
        .log-panel {
            background: #16213e;
            border-radius: 10px;
            overflow: hidden;
        }
        .log-header {
            padding: 10px 15px;
            background: #0f3460;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .log-header h3 { font-size: 14px; }
        .log-content {
            height: 200px;
            overflow-y: auto;
            padding: 10px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 12px;
            background: #0d1117;
        }
        .log-line { margin-bottom: 4px; white-space: pre-wrap; word-break: break-word; }
        .log-time { color: #6b7280; margin-right: 8px; }
        .checkbox-group { display: flex; align-items: center; gap: 10px; }
        .checkbox-group input[type="checkbox"] { width: auto; }
        @media (max-width: 768px) {
            .logs-container { grid-template-columns: 1fr; }
            .controls { flex-direction: column; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🎮 Molty Royale Bot Dashboard</h1>
            <div class="summary">
                <div class="summary-card">
                    <h3>Total Agents</h3>
                    <div class="value" id="total-agents">0</div>
                </div>
                <div class="summary-card">
                    <h3>Running</h3>
                    <div class="value" id="total-running">0</div>
                </div>
                <div class="summary-card">
                    <h3>Total Wins</h3>
                    <div class="value" id="total-wins">0</div>
                </div>
                <div class="summary-card">
                    <h3>Total Losses</h3>
                    <div class="value" id="total-losses">0</div>
                </div>
                <div class="summary-card">
                    <h3>Win Rate</h3>
                    <div class="value" id="total-winrate">0%</div>
                </div>
                <div class="summary-card">
                    <h3>Total Balance</h3>
                    <div class="value" id="total-balance">0</div>
                </div>
            </div>
        </header>

        <div class="controls">
            <button class="btn-primary" onclick="reloadAgents()">🔄 Reload Agents</button>
            <button class="btn-success" onclick="startSelected()">▶️ Start Selected</button>
            <button class="btn-danger" onclick="stopSelected()">⏹️ Stop Selected</button>
            <button class="btn-success" onclick="startAll()">▶️ Start All</button>
            <button class="btn-danger" onclick="stopAll()">⏹️ Stop All</button>
            <button class="btn-warning" onclick="clearLogs()">🗑️ Clear Logs</button>
            <div style="flex: 1;"></div>
            <select id="mode-select">
                <option value="safe">Safe</option>
                <option value="balanced" selected>Balanced</option>
                <option value="brutal">Brutal</option>
                <option value="brutals">Brutals (Sniper Mode)</option>
            </select>
            <button class="btn-secondary" onclick="setModeSelected()">Set Mode Selected</button>
            <button class="btn-secondary" onclick="setModeAll()">Set Mode All</button>
        </div>

        <table class="agent-table">
            <thead>
                <tr>
                    <th><input type="checkbox" id="select-all" onchange="toggleSelectAll()"></th>
                    <th>Agent</th>
                    <th>Mode</th>
                    <th>Wins</th>
                    <th>Losses</th>
                    <th>Balance</th>
                    <th>Status</th>
                    <th>PID</th>
                    <th>Restarts</th>
                    <th>API Key</th>
                </tr>
            </thead>
            <tbody id="agent-table-body">
            </tbody>
        </table>

        <div class="logs-container" id="logs-container"></div>
    </div>

    <script>
        let agents = [];
        let ws = null;
        let selectedAgents = new Set();

        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            ws = new WebSocket(\`\${protocol}//\${window.location.host}\`);
            
            ws.onopen = () => console.log('WebSocket connected');
            ws.onclose = () => setTimeout(connectWebSocket, 3000);
            ws.onerror = (e) => console.error('WebSocket error:', e);
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'update') {
                        agents = data.agents;
                        renderTable();
                        renderLogs();
                        updateSummary();
                    }
                } catch (e) {
                    console.error('Parse error:', e);
                }
            };
        }

        async function apiCall(method, path, body = null) {
            const options = { method, headers: { 'Content-Type': 'application/json' } };
            if (body) options.body = JSON.stringify(body);
            const res = await fetch(path, options);
            return res.json();
        }

        function reloadAgents() {
            fetchAgents();
        }

        async function fetchAgents() {
            try {
                const data = await apiCall('GET', '/api/agents');
                agents = data.agents || [];
                renderTable();
                renderLogs();
                updateSummary();
            } catch (e) {
                console.error('Fetch error:', e);
            }
        }

        function renderTable() {
            const tbody = document.getElementById('agent-table-body');
            tbody.innerHTML = agents.map(a => \`
                <tr>
                    <td><input type="checkbox" class="agent-checkbox" value="\${a.name}" \${selectedAgents.has(a.name) ? 'checked' : ''} onchange="toggleSelection('\${a.name}')"></td>
                    <td>\${a.name}</td>
                    <td>\${a.mode}</td>
                    <td>\${a.stats?.wins || 0}</td>
                    <td>\${a.stats?.losses || 0}</td>
                    <td>\${a.stats?.balance !== null ? a.stats.balance : '-'}</td>
                    <td><span class="status-badge status-\${getStatusClass(a.status)}">\${a.status}</span></td>
                    <td>\${a.pid}</td>
                    <td>\${a.restarts}</td>
                    <td>\${a.apiKeyPresent ? '✅' : '❌'}</td>
                </tr>
            \`).join('');
        }

        function getStatusClass(status) {
            const s = (status || '').toLowerCase();
            if (s.includes('running')) return 'running';
            if (s.includes('starting')) return 'starting';
            if (s.includes('restarting')) return 'restarting';
            if (s.includes('error')) return 'error';
            if (s.includes('exited')) return 'exited';
            return 'stopped';
        }

        function renderLogs() {
            const container = document.getElementById('logs-container');
            container.innerHTML = agents.map(a => \`
                <div class="log-panel">
                    <div class="log-header">
                        <h3>\${a.name}</h3>
                        <button class="btn-secondary" style="padding:4px 8px;font-size:11px;" onclick="clearAgentLogs('\${a.name}')">Clear</button>
                    </div>
                    <div class="log-content" id="log-\${a.name}">
                        \${(a.logs || []).map(l => \`<div class="log-line"><span class="log-time">[\${l.timestamp}]</span>\${escapeHtml(l.message)}</div>\`).join('')}
                    </div>
                </div>
            \`).join('');
        }

        function updateSummary() {
            const total = agents.length;
            const running = agents.filter(a => a.status.toLowerCase().includes('running')).length;
            const wins = agents.reduce((s, a) => s + (a.stats?.wins || 0), 0);
            const losses = agents.reduce((s, a) => s + (a.stats?.losses || 0), 0);
            const balance = agents.reduce((s, a) => s + (a.stats?.balance || 0), 0);
            const games = wins + losses;
            const winrate = games > 0 ? ((wins / games) * 100).toFixed(1) : '0.0';

            document.getElementById('total-agents').textContent = total;
            document.getElementById('total-running').textContent = running;
            document.getElementById('total-wins').textContent = wins;
            document.getElementById('total-losses').textContent = losses;
            document.getElementById('total-winrate').textContent = winrate + '%';
            document.getElementById('total-balance').textContent = balance.toLocaleString();
        }

        function toggleSelection(name) {
            if (selectedAgents.has(name)) {
                selectedAgents.delete(name);
            } else {
                selectedAgents.add(name);
            }
        }

        function toggleSelectAll() {
            const checkbox = document.getElementById('select-all');
            const checkboxes = document.querySelectorAll('.agent-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = checkbox.checked;
                if (checkbox.checked) {
                    selectedAgents.add(cb.value);
                } else {
                    selectedAgents.delete(cb.value);
                }
            });
        }

        function getSelectedNames() {
            return Array.from(selectedAgents);
        }

        async function startSelected() {
            const names = getSelectedNames();
            if (names.length === 0) { alert('Select agents first'); return; }
            for (const name of names) {
                await apiCall('POST', \`/api/agents/\${name}/start\`);
            }
        }

        async function stopSelected() {
            const names = getSelectedNames();
            if (names.length === 0) { alert('Select agents first'); return; }
            for (const name of names) {
                await apiCall('POST', \`/api/agents/\${name}/stop\`);
            }
        }

        async function startAll() {
            await apiCall('POST', '/api/agents/start-all');
        }

        async function stopAll() {
            await apiCall('POST', '/api/agents/stop-all');
        }

        async function setModeSelected() {
            const names = getSelectedNames();
            if (names.length === 0) { alert('Select agents first'); return; }
            const mode = document.getElementById('mode-select').value;
            for (const name of names) {
                await apiCall('POST', \`/api/agents/\${name}/mode\`, { mode });
            }
        }

        async function setModeAll() {
            const mode = document.getElementById('mode-select').value;
            await apiCall('POST', '/api/agents/mode-all', { mode });
        }

        async function clearLogs() {
            await apiCall('POST', '/api/logs/clear');
            fetchAgents();
        }

        async function clearAgentLogs(name) {
            await apiCall('POST', '/api/logs/clear', { agentName: name });
            fetchAgents();
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Initial load
        connectWebSocket();
        fetchAgents();
        setInterval(fetchAgents, 5000); // Poll every 5 seconds
    </script>
</body>
</html>
`;

// Serve HTML
app.get('/', (req, res) => {
    res.send(htmlContent);
});

// API Routes
app.get('/api/agents', (req, res) => {
    const agentList = agentManager.getAllAgents();
    for (const agent of agentList) {
        agent.logs = agentManager.getLogs(agent.name, 50);
    }
    res.json({ agents: agentList });
});

app.post('/api/agents/:name/start', (req, res) => {
    const result = agentManager.startAgent(req.params.name);
    res.json(result);
});

app.post('/api/agents/:name/stop', (req, res) => {
    const result = agentManager.stopAgent(req.params.name);
    res.json(result);
});

app.post('/api/agents/start-all', (req, res) => {
    const results = agentManager.startAllAgents();
    res.json({ results });
});

app.post('/api/agents/stop-all', (req, res) => {
    const results = agentManager.stopAllAgents();
    res.json({ results });
});

app.post('/api/agents/:name/mode', (req, res) => {
    const { mode } = req.body;
    const result = agentManager.setAgentMode(req.params.name, mode);
    res.json(result);
});

app.post('/api/agents/mode-all', (req, res) => {
    const { mode } = req.body;
    const results = agentManager.setAllAgentsMode(mode);
    res.json({ results });
});

app.post('/api/logs/clear', (req, res) => {
    const { agentName } = req.body || {};
    agentManager.clearLogs(agentName);
    res.json({ success: true });
});

app.get('/api/config', (req, res) => {
    res.json(agentManager.config);
});

app.post('/api/config', (req, res) => {
    const success = agentManager.updateConfig(req.body);
    res.json({ success });
});

// WebSocket handling
wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    
    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });
});

// Start server
async function startServer() {
    // Load agents
    const count = agentManager.loadAgents();
    console.log(`Loaded ${count} agent(s) from ${AGENTS_DIR}`);

    // Start server
    server.listen(PORT, () => {
        console.log(`\n🎮 Molty Royale Dashboard running at http://localhost:${PORT}`);
        console.log('Press Ctrl+C to stop\n');
    });
}

// Handle shutdown
process.on('SIGINT', () => {
    console.log('\n⏹️ Stopping all agents...');
    agentManager.stopAllAgents();
    setTimeout(() => {
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    }, 2000);
});

startServer();
