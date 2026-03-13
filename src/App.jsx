import { useState, useEffect, useRef } from 'react'
import { Play, Square, RefreshCw, Trash2, Activity, Trophy, Skull, Coins, TrendingUp, Users, Power, LogOut, UserCog } from 'lucide-react'
import { Button, Card, CardContent, Badge } from './components/ui.jsx'
import { cn } from './lib/utils.js'
import Login from './components/Login.jsx'
import AccountSettings from './components/AccountSettings.jsx'
import UserManagement from './components/UserManagement.jsx'

function StatCard({ icon: Icon, label, value, subValue, color = "text-primary" }) {
  return (
    <Card className="bg-card/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg bg-secondary/50", color)}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-xl font-bold">{value}</p>
            {subValue && <p className="text-xs text-muted-foreground">{subValue}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AgentCard({ agent, onStart, onStop, onModeChange, isLoading, onOpenLogs }) {
  const statusColors = {
    Running: "bg-green-500",
    Starting: "bg-blue-500",
    Restarting: "bg-yellow-500",
    Stopped: "bg-gray-400",
    Exited: "bg-purple-500",
    Crashed: "bg-red-500",
    Error: "bg-red-500",
  }

  const statusText = agent.latestStatus || (agent.status.includes('Running') ? '🎮 Active' : agent.status);
  const gameLink = agent.gameId ? `https://www.moltyroyale.com/games/${agent.gameId}` : null;

  return (
    <Card className="hover:border-primary/50 transition-colors shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", statusColors[agent.status] || "bg-gray-400")} />
            <h3 className="font-semibold text-sm">{agent.name}</h3>
          </div>
          <Badge variant={agent.apiKeyPresent ? "success" : "destructive"} className="text-xs">
            {agent.apiKeyPresent ? "✓" : "✗"}
          </Badge>
        </div>

        {/* Status */}
        <div className="mb-3 p-2 rounded-md bg-secondary/50">
          <p className="text-xs text-muted-foreground mb-1">Status</p>
          <p className="text-sm font-medium">{statusText}</p>
        </div>

        {/* In-Game Stats */}
        {agent.inGameStats && (
          <div className="mb-3 p-3 rounded-md bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
            <p className="text-xs text-primary font-medium mb-2">🎮 In-Game Stats</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-red-500/10 rounded p-1.5 text-center">
                <p className="text-red-600 font-bold">{agent.inGameStats.hp ?? '-'}/{agent.inGameStats.maxHp ?? '-'}</p>
                <p className="text-muted-foreground text-xs">HP</p>
              </div>
              <div className="bg-blue-500/10 rounded p-1.5 text-center">
                <p className="text-blue-600 font-bold">{agent.inGameStats.ep ?? '-'}/{agent.inGameStats.maxEp ?? '-'}</p>
                <p className="text-muted-foreground text-xs">EP</p>
              </div>
              <div className="bg-green-500/10 rounded p-1.5 text-center">
                <p className="text-green-600 font-bold">{agent.inGameStats.kills ?? '-'}</p>
                <p className="text-muted-foreground text-xs">Kills</p>
              </div>
            </div>
            {(agent.inGameStats.weapon || agent.inGameStats.region) && (
              <div className="mt-2 pt-2 border-t border-primary/10 grid grid-cols-2 gap-2 text-xs">
                {agent.inGameStats.weapon && (
                  <div>
                    <p className="text-muted-foreground">Weapon</p>
                    <p className="font-medium truncate">{agent.inGameStats.weapon}</p>
                  </div>
                )}
                {agent.inGameStats.region && (
                  <div>
                    <p className="text-muted-foreground">Region</p>
                    <p className="font-medium truncate">{agent.inGameStats.region}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Game ID with Link */}
        {agent.gameId && (
          <a
            href={gameLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-3 p-2 rounded-md bg-primary/10 border border-primary/20 block hover:bg-primary/20 transition-colors"
          >
            <p className="text-xs text-primary font-medium mb-0.5">🎮 Game ID</p>
            <p className="text-xs font-mono truncate" title={agent.gameId}>
              {agent.gameId.slice(0, 8)}...{agent.gameId.slice(-4)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Click to open →</p>
          </a>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
          <div className="text-center p-2 rounded-md bg-secondary/30">
            <p className="text-muted-foreground text-xs mb-0.5">W</p>
            <p className="font-bold text-green-600">{agent.stats?.wins || 0}</p>
          </div>
          <div className="text-center p-2 rounded-md bg-secondary/30">
            <p className="text-muted-foreground text-xs mb-0.5">L</p>
            <p className="font-bold text-red-600">{agent.stats?.losses || 0}</p>
          </div>
          <div className="text-center p-2 rounded-md bg-secondary/30">
            <p className="text-muted-foreground text-xs mb-0.5">Moltz</p>
            <p className="font-bold text-yellow-600">{agent.stats?.balance ?? '-'}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-2">
          <select
            value={agent.mode}
            onChange={(e) => onModeChange(agent.name, e.target.value)}
            disabled={isLoading}
            className="flex-1 bg-secondary text-xs rounded-md px-2 py-1.5 outline-none disabled:opacity-50 border border-border"
          >
            <option value="safe">Safe</option>
            <option value="balanced">Balanced</option>
            <option value="brutal">Brutal</option>
            <option value="brutals">Brutals</option>
          </select>
          {agent.status.includes('Running') || agent.status.includes('Starting') ? (
            <Button size="sm" variant="destructive" onClick={() => onStop(agent.name)} disabled={isLoading}>
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="sm" variant="default" onClick={() => onStart(agent.name)} disabled={!agent.apiKeyPresent || isLoading}>
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Info */}
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span>PID: {agent.pid}</span>
          <button
            onClick={() => onStart(agent.name)}
            className="text-primary hover:underline"
          >
            ↻ {agent.restarts}
          </button>
        </div>

        {/* View Logs Button */}
        <button
          onClick={() => onOpenLogs(agent)}
          className="mt-3 w-full py-2 text-xs text-muted-foreground hover:text-primary hover:bg-secondary rounded-md transition-colors"
        >
          📄 View Terminal Logs
        </button>
      </CardContent>
    </Card>
  )
}

export default function App() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState({})
  const [selectedMode, setSelectedMode] = useState('balanced')
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [agentLogs, setAgentLogs] = useState({})
  const [showLogs, setShowLogs] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const logsEndRef = useRef(null)
  const logsContainerRef = useRef(null)

  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [username, setUsername] = useState('')
  const [showAccountSettings, setShowAccountSettings] = useState(false)
  const [showUserManagement, setShowUserManagement] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)

  // Check authentication on mount
  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    const token = localStorage.getItem('authToken')
    const storedUsername = localStorage.getItem('username')
    
    if (!token) {
      setAuthLoading(false)
      return
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      
      if (res.ok) {
        const data = await res.json()
        setUsername(data.username)
        setIsAuthenticated(true)
      } else if (storedUsername) {
        // Fallback to stored username if session expired
        setUsername(storedUsername)
        setIsAuthenticated(true)
      }
    } catch (e) {
      console.error('Auth check error:', e)
    } finally {
      setAuthLoading(false)
    }
  }

  function handleLogin(loggedInUsername) {
    setUsername(loggedInUsername)
    setIsAuthenticated(true)
  }

  function handleLogout() {
    setIsAuthenticated(false)
    setUsername('')
    setShowAccountSettings(false)
  }

  function handleOpenUserManagement() {
    setShowAccountSettings(false)
    setShowUserManagement(true)
  }

  useEffect(() => {
    fetchAgents()
    const interval = setInterval(fetchAgents, 3000)
    return () => clearInterval(interval)
  }, [])

  // Auto-scroll logs only when autoScroll is enabled
  useEffect(() => {
    if (showLogs && autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [agentLogs, showLogs, autoScroll])

  // Fetch logs periodically when modal is open
  useEffect(() => {
    if (!showLogs || !selectedAgent) return
    
    fetchLogs(selectedAgent.name)
    const interval = setInterval(() => fetchLogs(selectedAgent.name), 2000)
    return () => clearInterval(interval)
  }, [showLogs, selectedAgent])

  // Handle scroll to detect user manual scroll
  const handleLogsScroll = () => {
    if (logsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      if (!isNearBottom && autoScroll) {
        setAutoScroll(false);
      } else if (isNearBottom && !autoScroll) {
        setAutoScroll(true);
      }
    }
  };

  async function fetchAgents() {
    try {
      const res = await fetch('/api/agents')
      const data = await res.json()
      setAgents(data.agents || [])
      setLoading(false)
    } catch (e) {
      console.error('Fetch error:', e)
      setLoading(false)
    }
  }

  async function fetchLogs(agentName) {
    try {
      const res = await fetch(`/api/logs/${agentName}?limit=200`)
      const data = await res.json()
      setAgentLogs(prev => ({ ...prev, [agentName]: data.logs || [] }))
    } catch (e) {
      console.error('Fetch logs error:', e)
    }
  }

  async function apiCall(method, path, body = null, actionKey = null) {
    try {
      if (actionKey) setActionLoading(prev => ({ ...prev, [actionKey]: true }))

      const token = localStorage.getItem('authToken')
      const options = { 
        method, 
        headers: { 
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        } 
      }
      if (body) options.body = JSON.stringify(body)
      const res = await fetch(path, options)
      const result = await res.json()
      console.log(`API ${method} ${path}:`, result)

      setTimeout(fetchAgents, 300)
      return result
    } catch (e) {
      console.error(`API error ${method} ${path}:`, e)
      throw e
    } finally {
      if (actionKey) setActionLoading(prev => ({ ...prev, [actionKey]: false }))
    }
  }

  async function handleStart(name) {
    await apiCall('POST', `/api/agents/${name}/start`, null, `start-${name}`)
  }

  async function handleStop(name) {
    await apiCall('POST', `/api/agents/${name}/stop`, null, `stop-${name}`)
  }

  async function handleModeChange(name, mode) {
    await apiCall('POST', `/api/agents/${name}/mode`, { mode }, `mode-${name}`)
  }

  async function handleStartAll() {
    await apiCall('POST', '/api/agents/start-all', null, 'start-all')
  }

  async function handleStopAll() {
    await apiCall('POST', '/api/agents/stop-all', null, 'stop-all')
  }

  async function handleSetModeAll() {
    await apiCall('POST', '/api/agents/mode-all', { mode: selectedMode }, 'mode-all')
  }

  function handleViewLogs(agent) {
    setSelectedAgent(agent)
    fetchLogs(agent.name)
    setShowLogs(true)
  }

  async function handleClearLogs(agentName) {
    await apiCall('POST', '/api/logs/clear', { agentName })
    setAgentLogs(prev => ({ ...prev, [agentName]: [] }))
  }

  // Calculate stats
  const totalAgents = agents.length
  const runningAgents = agents.filter(a => a.status.includes('Running') || a.status.includes('Starting')).length
  const totalWins = agents.reduce((sum, a) => sum + (a.stats?.wins || 0), 0)
  const totalLosses = agents.reduce((sum, a) => sum + (a.stats?.losses || 0), 0)
  const totalBalance = agents.reduce((sum, a) => sum + (a.stats?.balance || 0), 0)
  const winRate = totalWins + totalLosses > 0 ? ((totalWins / (totalWins + totalLosses)) * 100).toFixed(1) : 0

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Molty Royale Dashboard</h1>
                <p className="text-xs text-muted-foreground">Agent Management Console</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-2 mr-4 px-3 py-1.5 rounded-md bg-secondary/50">
                <UserCog className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{username}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowAccountSettings(true)}>
                <UserCog className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Account</span>
              </Button>
              <Button variant="outline" size="sm" onClick={fetchAgents}>
                <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <StatCard icon={Users} label="Total Agents" value={totalAgents} color="text-blue-600" />
          <StatCard icon={Power} label="Running" value={runningAgents} color="text-green-600" />
          <StatCard icon={Trophy} label="Wins" value={totalWins} color="text-green-600" />
          <StatCard icon={Skull} label="Losses" value={totalLosses} color="text-red-600" />
          <StatCard icon={TrendingUp} label="Win Rate" value={`${winRate}%`} color="text-yellow-600" />
          <StatCard icon={Coins} label="Balance" value={totalBalance.toLocaleString()} color="text-purple-600" />
        </div>

        {/* Controls */}
        <Card className="mb-6 bg-white shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleStartAll} variant="default" size="sm" disabled={actionLoading['start-all']}>
                  <Play className={cn("h-4 w-4 mr-2", actionLoading['start-all'] && "animate-spin")} />
                  Start All
                </Button>
                <Button onClick={handleStopAll} variant="destructive" size="sm" disabled={actionLoading['stop-all']}>
                  <Square className="h-4 w-4 mr-2" />
                  Stop All
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Set Mode All:</span>
                <select
                  value={selectedMode}
                  onChange={(e) => setSelectedMode(e.target.value)}
                  disabled={actionLoading['mode-all']}
                  className="bg-secondary text-sm rounded-md px-3 py-2 outline-none disabled:opacity-50 border border-border"
                >
                  <option value="safe">Safe</option>
                  <option value="balanced">Balanced</option>
                  <option value="brutal">Brutal</option>
                  <option value="brutals">Brutals</option>
                </select>
                <Button onClick={handleSetModeAll} variant="outline" size="sm" disabled={actionLoading['mode-all']}>
                  Apply
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Agents Grid */}
        {agents.length === 0 ? (
          <Card className="p-8 text-center bg-white shadow-sm">
            <p className="text-muted-foreground">No agents found. Create .env files in the agents directory.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {agents.map((agent) => (
              <AgentCard
                key={agent.name}
                agent={agent}
                onStart={handleStart}
                onStop={handleStop}
                onModeChange={handleModeChange}
                onOpenLogs={handleViewLogs}
                isLoading={actionLoading[`start-${agent.name}`] || actionLoading[`stop-${agent.name}`] || actionLoading[`mode-${agent.name}`]}
              />
            ))}
          </div>
        )}

        {/* Logs Modal */}
        {showLogs && selectedAgent && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowLogs(false)}>
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h3 className="font-semibold text-lg">{selectedAgent.name} - Terminal Logs</h3>
                  <p className="text-xs text-muted-foreground">Real-time output from agent process</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAutoScroll(!autoScroll)}
                    title={autoScroll ? "Disable auto-scroll" : "Enable auto-scroll"}
                  >
                    {autoScroll ? '⏸️' : '▶️'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleClearLogs(selectedAgent.name)}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowLogs(false)}>
                    ✕
                  </Button>
                </div>
              </div>
              <div
                ref={logsContainerRef}
                onScroll={handleLogsScroll}
                className="p-4 h-[60vh] overflow-y-auto bg-gray-900 text-gray-100 font-mono text-xs"
              >
                {(agentLogs[selectedAgent.name] || []).length === 0 ? (
                  <p className="text-gray-500">No logs yet. Start the agent to see output.</p>
                ) : (
                  agentLogs[selectedAgent.name].map((log, i) => (
                    <div key={i} className="py-0.5 hover:bg-gray-800/50">
                      <span className="text-gray-500">[{log.timestamp}]</span> <span className="text-gray-200">{log.message}</span>
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
              {!autoScroll && (
                <div className="absolute bottom-20 right-8">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setAutoScroll(true);
                      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    ⬇️ Scroll to Bottom
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Account Settings Modal */}
        {showAccountSettings && (
          <AccountSettings
            username={username}
            onClose={() => setShowAccountSettings(false)}
            onLogout={handleLogout}
            onOpenUserManagement={handleOpenUserManagement}
          />
        )}

        {/* User Management Modal */}
        {showUserManagement && (
          <UserManagement
            onClose={() => setShowUserManagement(false)}
          />
        )}
      </div>
    </div>
  )
}
