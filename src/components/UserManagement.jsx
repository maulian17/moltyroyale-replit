import { useState, useEffect } from 'react'
import { Users, UserPlus, Trash2, Key, RefreshCw } from 'lucide-react'
import { Button, Card, CardContent } from '../components/ui.jsx'

export default function UserManagement({ onClose }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [resetPasswordUser, setResetPasswordUser] = useState(null)
  const [resetPasswordValue, setResetPasswordValue] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    fetchUsers()
  }, [])

  async function fetchUsers() {
    try {
      const token = localStorage.getItem('authToken')
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
      }
    } catch (e) {
      console.error('Fetch users error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateUser(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    try {
      const token = localStorage.getItem('authToken')
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ username: newUsername, password: newPassword }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user')
      }

      setSuccess(`User "${newUsername}" created successfully!`)
      setNewUsername('')
      setNewPassword('')
      fetchUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDeleteUser(username) {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
      return
    }

    try {
      const token = localStorage.getItem('authToken')
      const res = await fetch(`/api/admin/users/${username}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete user')
      }

      setSuccess(`User "${username}" deleted successfully!`)
      fetchUsers()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    try {
      const token = localStorage.getItem('authToken')
      const res = await fetch(`/api/admin/users/${resetPasswordUser}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword: resetPasswordValue }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset password')
      }

      setSuccess(`Password for "${resetPasswordUser}" reset successfully!`)
      setResetPasswordUser(null)
      setResetPasswordValue('')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">User Management</h3>
              <p className="text-xs text-muted-foreground">Create and manage user accounts</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              ✕
            </Button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto max-h-[60vh] space-y-4">
          {/* Create User Form */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium">Create New User</h4>
              </div>
              <form onSubmit={handleCreateUser} className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium mb-1">Username</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    placeholder="Enter username"
                    required
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium mb-1">Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    placeholder="Enter password"
                    required
                    minLength={4}
                  />
                </div>
                <Button type="submit" size="sm">
                  <UserPlus className="h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Users List */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-medium">Existing Users ({users.length})</h4>
              </div>
              
              {loading ? (
                <div className="text-center py-4 text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Loading users...
                </div>
              ) : users.length === 0 ? (
                <p className="text-muted-foreground text-sm">No users found</p>
              ) : (
                <div className="space-y-2">
                  {users.map((user) => (
                    <div key={user.username} className="flex items-center justify-between p-3 rounded-md bg-secondary/50">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-primary/10">
                          <Users className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{user.username}</p>
                          <p className="text-xs text-muted-foreground">
                            {user.role === 'admin' ? '👑 Admin' : '👤 User'}
                            {user.createdAt && ` • Created ${new Date(user.createdAt).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {user.username !== 'admin' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setResetPasswordUser(user.username)
                                setResetPasswordValue('')
                              }}
                            >
                              <Key className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteUser(user.username)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Messages */}
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 rounded-md bg-green-500/10 text-green-600 text-sm">
              {success}
            </div>
          )}
        </div>

        {/* Reset Password Modal */}
        {resetPasswordUser && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center" onClick={() => setResetPasswordUser(null)}>
            <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
              <h4 className="font-semibold mb-4">Reset Password for "{resetPasswordUser}"</h4>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">New Password</label>
                  <input
                    type="password"
                    value={resetPasswordValue}
                    onChange={(e) => setResetPasswordValue(e.target.value)}
                    className="w-full px-4 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Enter new password"
                    required
                    minLength={4}
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">
                    Reset Password
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setResetPasswordUser(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
