/**
 * Backend API Server for Molty Royale Dashboard
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const PORT = process.env.DASHBOARD_PORT || 3000;
const AGENTS_DIR = path.join(__dirname, 'agents');
const CONFIG_PATH = path.join(__dirname, 'dashboard_config.json');

const ALLOWED_MODES = ['safe', 'balanced', 'brutal', 'brutals'];

// ══════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════

function loadJson(filePath, defaultData = {}) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
    } catch (e) {
        console.error(`Error loading ${filePath}:`, e.message);
    }
    return defaultData;
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
    return ALLOWED_MODES.includes(mode) ? mode : defaultValue;
}

// ══════════════════════════════════════════════════════════════
//  AGENT MANAGER
// ══════════════════════════════════════════════════════════════

class AgentManager {
    constructor() {
        this.agents = new Map();
        this.config = loadJson(CONFIG_PATH, {
            restartDelay: 5,
            staggerSeconds: 2,
            restartAlways: false,
            defaultMode: 'balanced',
        });
        this.logs = new Map();
        this.maxLogLines = 100;
        this.wss = null;
    }

    loadAgents() {
        if (!fs.existsSync(AGENTS_DIR)) {
            fs.mkdirSync(AGENTS_DIR, { recursive: true });
        }

        const files = fs.readdirSync(AGENTS_DIR);
        const envFiles = files.filter(f => f.endsWith('.env'));

        for (const envFile of envFiles) {
            const envPath = path.join(AGENTS_DIR, envFile);
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
                gameId: null,
                latestStatus: null,
                inGameStats: {
                    hp: null,
                    maxHp: null,
                    ep: null,
                    maxEp: null,
                    kills: null,
                    weapon: null,
                    region: null,
                },
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
            gameId: a.gameId,
            latestStatus: a.latestStatus,
            inGameStats: a.inGameStats,
        }));
    }

    addLog(agentName, message) {
        if (!this.logs.has(agentName)) {
            this.logs.set(agentName, []);
        }
        const logs = this.logs.get(agentName);
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        logs.push({ timestamp, message });
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
        if (!agent.apiKeyPresent) {
            console.log(`❌ Cannot start ${name}: API_KEY missing`);
            return { success: false, error: 'API_KEY missing' };
        }

        const scriptPath = path.join(__dirname, 'agent.js');
        console.log(`\n🚀 Starting agent: ${name}`);
        console.log(`   Script: ${scriptPath}`);
        console.log(`   Script exists: ${fs.existsSync(scriptPath)}`);

        if (!fs.existsSync(scriptPath)) {
            console.log(`❌ Script not found: ${scriptPath}`);
            return { success: false, error: `Script not found: ${scriptPath}` };
        }

        const env = { ...process.env, ...agent.values };
        env.AGGRO_MODE = normalizeMode(agent.mode, this.config.defaultMode);
        env.NODE_ENV = 'production';

        try {
            const proc = spawn('node', [scriptPath], {
                cwd: __dirname,
                env,
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            agent.process = proc;
            agent.status = 'Starting';
            agent.startedAt = Date.now();
            agent.pid = String(proc.pid);

            console.log(`✅ Process spawned: PID ${proc.pid}`);
            this.addLog(name, `🚀 Start: node agent.js (PID: ${proc.pid})`);

            proc.stdout.on('data', (data) => {
                const text = data.toString('utf-8').trim();
                for (const line of text.split('\n')) {
                    if (line) {
                        console.log(`[${name}] ${line}`);
                        this.addLog(name, line);
                        this._parseStats(name, line);
                    }
                }
            });

            proc.stderr.on('data', (data) => {
                const text = data.toString('utf-8').trim();
                for (const line of text.split('\n')) {
                    if (line) {
                        console.error(`[${name} ERR] ${line}`);
                        this.addLog(name, `[ERR] ${line}`);
                    }
                }
            });

            proc.on('error', (err) => {
                console.error(`[${name}] Process error: ${err.message}`);
                this.addLog(name, `❌ Process error: ${err.message}`);
            });

            proc.on('close', (code) => {
                console.log(`[${name}] Process closed with code ${code}`);
                agent.lastExitCode = code;
                agent.process = null;
                agent.startedAt = null;

                const wasUserStop = agent.status === 'Stopping';
                agent.status = wasUserStop ? 'Stopped' : (code === 0 ? 'Exited' : 'Crashed');

                this.addLog(name, `♻️ Exit code ${code}.`);

                if (!wasUserStop && (this.config.restartAlways || code !== 0)) {
                    agent.restarts++;
                    agent.status = `Restarting (${this.config.restartDelay}s)`;
                    this._broadcast({ type: 'update' });

                    setTimeout(() => {
                        if (agent.status.startsWith('Restarting')) {
                            this.startAgent(name);
                        }
                    }, this.config.restartDelay * 1000);
                }

                this._broadcast({ type: 'update' });
            });

            agent.status = 'Running';
            this._broadcast({ type: 'update' });
            return { success: true };

        } catch (e) {
            console.error(`❌ Failed to start ${name}: ${e.message}`);
            agent.status = 'Error';
            agent.process = null;
            this.addLog(name, `❌ Failed to start: ${e.message}`);
            this._broadcast({ type: 'update' });
            return { success: false, error: e.message };
        }
    }

    stopAgent(name) {
        const agent = this.agents.get(name);
        if (!agent) return { success: false, error: 'Agent not found' };
        if (!agent.process) return { success: false, error: 'Not running' };

        agent.status = 'Stopping';
        this.addLog(name, '⏹️ Stopping...');

        try {
            agent.process.kill('SIGTERM');
            setTimeout(() => {
                if (agent.process) {
                    try { agent.process.kill('SIGKILL'); } catch (e) {}
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
            setTimeout(() => this.startAgent(name), staggerDelay * 1000);
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
            this.addLog(name, `⚙️ Mode: ${normalizedMode}`);
            if (agent.process) {
                this.addLog(name, 'ℹ️ Restart for change to apply');
            }
            this._broadcast({ type: 'update' });
            return { success: true };
        }
        return { success: false, error: 'Failed to save' };
    }

    setAllAgentsMode(mode) {
        const results = [];
        const normalizedMode = normalizeMode(mode);
        for (const [name] of this.agents) {
            results.push(this.setAgentMode(name, normalizedMode));
        }
        return results;
    }

    _parseStats(agentName, message) {
        const agent = this.agents.get(agentName);
        if (!agent) return;

        // Parse W/L
        const wlMatch = message.match(/\bW\s*:\s*(\d+)\s+L\s*:\s*(\d+)\b/i);
        if (wlMatch) {
            agent.stats.wins = parseInt(wlMatch[1], 10);
            agent.stats.losses = parseInt(wlMatch[2], 10);
            this._broadcast({ type: 'update' });
        }

        // Parse Wins
        const winsMatch = message.match(/\bWins\s*:\s*(\d+)\b/i);
        if (winsMatch) {
            agent.stats.wins = parseInt(winsMatch[1], 10);
            this._broadcast({ type: 'update' });
        }

        // Parse Losses
        const lossesMatch = message.match(/\bLosses\s*:\s*(\d+)\b/i);
        if (lossesMatch) {
            agent.stats.losses = parseInt(lossesMatch[2], 10);
            this._broadcast({ type: 'update' });
        }

        // Parse Balance
        const balanceMatch = message.match(/Moltz Balance awal\s*:\s*([+-]?[\d.,]+)/i) ||
                            message.match(/\bMoltz\s*:\s*([+-]?[\d.,]+)/i);
        if (balanceMatch) {
            const balance = parseFloat(balanceMatch[1].replace(/,/g, ''));
            if (!isNaN(balance)) {
                agent.stats.balance = balance;
                this._broadcast({ type: 'update' });
            }
        }

        // Parse Game ID
        const gameMatch = message.match(/Game dipilih:.*?\(ID:\s*([0-9a-fA-F-]+)\)/i) ||
                         message.match(/Game dibuat:.*?\(ID:\s*([0-9a-fA-F-]+)\)/i) ||
                         message.match(/ke game\s+([0-9a-fA-F-]+)/i);
        if (gameMatch) {
            agent.gameId = gameMatch[1];
            this._broadcast({ type: 'update' });
        }

        // Parse in-game stats (HP, EP, Kills, Weapon, Region)
        // Format: HP [████████████░░░░░░░░] 60/100  |  EP: 8/10  |  Kills: 2
        // Also match: HP 60/100 | EP: 8/10 | Kills: 2
        
        const hpMatch = message.match(/HP\s*(?:\[.*?\])?\s*(\d+)\/(\d+)/i);
        if (hpMatch) {
            agent.inGameStats.hp = parseInt(hpMatch[1], 10);
            agent.inGameStats.maxHp = parseInt(hpMatch[2], 10);
            console.log(`[${agentName}] Parsed HP: ${agent.inGameStats.hp}/${agent.inGameStats.maxHp}`);
        }

        const epMatch = message.match(/EP:\s*(\d+)\/(\d+)/i);
        if (epMatch) {
            agent.inGameStats.ep = parseInt(epMatch[1], 10);
            agent.inGameStats.maxEp = parseInt(epMatch[2], 10);
            console.log(`[${agentName}] Parsed EP: ${agent.inGameStats.ep}/${agent.inGameStats.maxEp}`);
        }

        const killsMatch = message.match(/Kills:\s*(\d+)/i);
        if (killsMatch) {
            agent.inGameStats.kills = parseInt(killsMatch[1], 10);
            console.log(`[${agentName}] Parsed Kills: ${agent.inGameStats.kills}`);
        }

        // Parse Weapon: Weapon: Katana  |  Region: Dark Forest (forest)
        const weaponMatch = message.match(/Weapon:\s*([^(|]+)/i);
        if (weaponMatch) {
            agent.inGameStats.weapon = weaponMatch[1].trim();
            console.log(`[${agentName}] Parsed Weapon: ${agent.inGameStats.weapon}`);
        }

        const regionMatch = message.match(/Region:\s*([^(\s]+)/i);
        if (regionMatch) {
            agent.inGameStats.region = regionMatch[1].trim();
            console.log(`[${agentName}] Parsed Region: ${agent.inGameStats.region}`);
        }

        // Broadcast update if any stats changed
        if (hpMatch || epMatch || killsMatch || weaponMatch || regionMatch) {
            this._broadcast({ type: 'update' });
        }

        // Parse latest status (GAME DIMULAI, Agent mati, etc)
        if (message.includes('GAME DIMULAI')) {
            agent.latestStatus = '🎮 In Game';
            this._broadcast({ type: 'update' });
        } else if (message.includes('Agent mati')) {
            agent.latestStatus = '💀 Dead';
            agent.inGameStats = { hp: null, maxHp: null, ep: null, maxEp: null, kills: null, weapon: null, region: null };
            this._broadcast({ type: 'update' });
        } else if (message.includes('GAME SELESAI')) {
            agent.latestStatus = '🏁 Finished';
            agent.inGameStats = { hp: null, maxHp: null, ep: null, maxEp: null, kills: null, weapon: null, region: null };
            this._broadcast({ type: 'update' });
        } else if (message.includes('Menunggu game')) {
            agent.latestStatus = '⏳ Waiting';
            this._broadcast({ type: 'update' });
        } else if (message.includes('Mendaftarkan agent')) {
            agent.latestStatus = '📝 Registering';
            this._broadcast({ type: 'update' });
        }
    }

    _broadcast(data) {
        if (this.wss) {
            const message = JSON.stringify(data);
            for (const client of this.wss.clients) {
                if (client.readyState === 1) {
                    client.send(message);
                }
            }
        }
    }

    setWebSocket(wss) {
        this.wss = wss;
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

app.use(cors());
app.use(express.json());

// API Routes
app.get('/api/agents', (req, res) => {
    const agents = agentManager.getAllAgents();
    console.log('GET /api/agents - Returning', agents.length, 'agents');
    res.json({ agents });
});

app.post('/api/agents/:name/start', (req, res) => {
    const { name } = req.params;
    console.log('POST /api/agents/:name/start - Agent:', name);
    const result = agentManager.startAgent(name);
    console.log('Start result:', result);
    res.json(result);
});

app.post('/api/agents/:name/stop', (req, res) => {
    const { name } = req.params;
    console.log('POST /api/agents/:name/stop - Agent:', name);
    const result = agentManager.stopAgent(name);
    console.log('Stop result:', result);
    res.json(result);
});

app.post('/api/agents/start-all', (req, res) => {
    console.log('POST /api/agents/start-all');
    const results = agentManager.startAllAgents();
    console.log('Start all results:', results);
    res.json({ results });
});

app.post('/api/agents/stop-all', (req, res) => {
    console.log('POST /api/agents/stop-all');
    const results = agentManager.stopAllAgents();
    console.log('Stop all results:', results);
    res.json({ results });
});

app.post('/api/agents/:name/mode', (req, res) => {
    const { name } = req.params;
    const { mode } = req.body;
    console.log(`POST /api/agents/:name/mode - Agent: ${name}, Mode: ${mode}`);
    const result = agentManager.setAgentMode(name, mode);
    console.log('Mode result:', result);
    res.json(result);
});

app.post('/api/agents/mode-all', (req, res) => {
    const { mode } = req.body;
    console.log(`POST /api/agents/mode-all - Mode: ${mode}`);
    const results = agentManager.setAllAgentsMode(mode);
    console.log('Mode all results:', results);
    res.json({ results });
});

// Logs endpoints
app.get('/api/logs/:agentName', (req, res) => {
    const { agentName } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const logs = agentManager.getLogs(agentName, limit);
    res.json({ logs });
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
    const success = agentManager.updateConfig?.(req.body);
    res.json({ success });
});

// WebSocket
wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    ws.on('close', () => console.log('WebSocket client disconnected'));
});

// Start server
async function startServer() {
    const count = agentManager.loadAgents();
    console.log(`\n🎮 Molty Royale Dashboard`);
    console.log(`Loaded ${count} agent(s) from ${AGENTS_DIR}`);
    
    // Debug: log all agents
    console.log('\n📋 Agents loaded:');
    for (const [name, agent] of agentManager.agents) {
        console.log(`  - ${name}: API_KEY=${agent.apiKeyPresent ? '✅' : '❌'}, Mode=${agent.mode}`);
    }
    console.log('');
    
    console.log(`\nBackend: http://localhost:${PORT}`);
    console.log(`Frontend: http://localhost:5173 (Vite dev server)`);
    console.log('\nPress Ctrl+C to stop\n');

    server.listen(PORT, () => {
        console.log('Backend server ready');
    });
}

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
