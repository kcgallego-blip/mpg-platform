'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, User, Mail, Shield, Clock, CheckCircle, XCircle, RefreshCw, ChevronDown, Pencil, KeyRound, Copy, Eye, EyeOff, AlertTriangle, ShieldX } from 'lucide-react'
import { useAuthStore } from '@/lib/authStore'
import { getUsers, updateUserStatus, updateUserRole, updateUserName } from '@/lib/db'
import type { AccountUser } from '@/lib/db'
import { canResetLocalPassword, canViewAccounts } from '@/lib/accountAccess'

type UserRow = AccountUser

const ROLE_OPTIONS = ['Admin', 'Team Leader', 'Operations Manager', 'IT']

export default function AccountsPage() {
  const { user: currentUser } = useAuthStore()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingUser, setSavingUser] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')

  const [statusModalUser, setStatusModalUser] = useState<UserRow | null>(null)
  const [roleModalUser, setRoleModalUser] = useState<UserRow | null>(null)
  const [nameModalUser, setNameModalUser] = useState<UserRow | null>(null)
  const [resetModalUser, setResetModalUser] = useState<UserRow | null>(null)
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [showTemporaryPassword, setShowTemporaryPassword] = useState(false)
  const [copied, setCopied] = useState(false)
  const [tempName, setTempName] = useState('')

  const isAdmin = currentUser?.role === 'Admin'

  const fetchUsers = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getUsers()
      setUsers(data)
    } catch (err: any) {
      console.error('Error fetching users:', err)
      setError(err.message || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (canViewAccounts(currentUser?.role)) {
      void fetchUsers()
    }
  }, [currentUser?.email, currentUser?.role])

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users
    return users.filter(user =>
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.name && user.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (user.role && user.role.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  }, [users, searchQuery])

  const handleStatusToggle = async () => {
    if (!statusModalUser) return

    const newStatus = !statusModalUser.is_active
    setSavingUser(statusModalUser.email)

    try {
      await updateUserStatus(statusModalUser.email, newStatus)
      setUsers(prev =>
        prev.map(u => u.email === statusModalUser.email ? { ...u, is_active: newStatus } : u)
      )
      setStatusModalUser(null)
    } catch (err: any) {
      console.error('Error updating user status:', err)
      alert('Failed to update user status')
    } finally {
      setSavingUser(null)
    }
  }

  const handleRoleChange = async (role: string) => {
    if (!roleModalUser) return
    setSavingUser(roleModalUser.email)

    try {
      await updateUserRole(roleModalUser.email, role)
      setUsers(prev =>
        prev.map(u => u.email === roleModalUser.email ? { ...u, role } : u)
      )
      setRoleModalUser(null)
    } catch (err: any) {
      console.error('Error updating user role:', err)
      alert('Failed to update user role')
    } finally {
      setSavingUser(null)
    }
  }

  const handleNameSave = async () => {
    if (!nameModalUser) return
    if (!tempName.trim()) {
      setNameModalUser(null)
      return
    }
    setSavingUser(nameModalUser.email)

    try {
      await updateUserName(nameModalUser.email, tempName)
      setUsers(prev =>
        prev.map(u => u.email === nameModalUser.email ? { ...u, name: tempName } : u)
      )
      setNameModalUser(null)
    } catch (err: any) {
      console.error('Error updating user name:', err)
      alert('Failed to update user name')
    } finally {
      setSavingUser(null)
    }
  }

  const closeResetModal = () => {
    setResetModalUser(null)
    setTemporaryPassword(null)
    setResetError(null)
    setShowTemporaryPassword(false)
    setCopied(false)
  }

  const handlePasswordReset = async () => {
    if (!resetModalUser) return

    setSavingUser(resetModalUser.email)
    setResetError(null)
    try {
      const response = await fetch('/api/accounts/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: resetModalUser.email }),
      })
      const data = await response.json() as { temporaryPassword?: string; error?: string }
      if (!response.ok || !data.temporaryPassword) {
        throw new Error(data.error || 'Failed to reset password')
      }
      setTemporaryPassword(data.temporaryPassword)
    } catch (resetRequestError) {
      setResetError(resetRequestError instanceof Error ? resetRequestError.message : 'Failed to reset password')
    } finally {
      setSavingUser(null)
    }
  }

  const handleCopyTemporaryPassword = async () => {
    if (!temporaryPassword) return

    try {
      await navigator.clipboard.writeText(temporaryPassword)
      setCopied(true)
    } catch {
      setResetError('Copy failed. Select and copy the temporary password manually.')
    }
  }

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (currentUser && !canViewAccounts(currentUser.role)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md rounded-2xl border border-error/20 bg-surface/80 p-8 text-center">
          <ShieldX size={36} className="mx-auto mb-4 text-error" />
          <h1 className="font-hanken text-2xl font-bold text-on-surface">Admin or IT access required</h1>
          <p className="mt-2 text-sm text-on-surface-variant">You do not have permission to view user accounts.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-hanken text-display-lg font-bold text-on-surface mb-2">
            Accounts
          </h1>
          <p className="text-on-surface-variant">
            Manage user accounts and permissions
          </p>
        </div>
        <button
          onClick={fetchUsers}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-lg py-md rounded-lg glass-effect text-on-surface font-medium transition-all hover:bg-surface-container-high disabled:opacity-50"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Search Bar */}
      <div className="glass-effect rounded-xl p-6 backdrop-blur-glass-lg">
        <div className="relative">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or role..."
            className="w-full pl-10 pr-4 py-3 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-6 rounded-xl bg-error/10 text-error text-center">
          {error}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-outline-variant/30 border-t-primary rounded-full animate-spin"></div>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-20 text-on-surface-variant">
          No users found matching the search criteria
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl">
          <table className="w-full">
            <thead className="bg-surface-container-low">
              <tr>
                <th className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant">
                  <div className="flex items-center gap-1.5">
                    <User size={16} />
                    <span>Name</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant">
                  <div className="flex items-center gap-1.5">
                    <Mail size={16} />
                    <span>Email</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant">
                  <div className="flex items-center gap-1.5">
                    <Shield size={16} />
                    <span>Role</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant">
                  Avatar
                </th>
                <th className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant">
                  <div className="flex items-center gap-1.5">
                    <Clock size={16} />
                    <span>Last Login</span>
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-label-sm font-semibold text-on-surface-variant">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {filteredUsers.map((user) => (
                <tr key={user.email} className="hover:bg-surface-container-high/50 transition-colors">
                  <td className="px-4 py-3 text-sm">
                    {isAdmin ? (
                      <button
                        onClick={() => {
                          setNameModalUser(user)
                          setTempName(user.name || '')
                        }}
                        disabled={savingUser === user.email}
                        className="flex items-center gap-1 text-on-surface hover:text-primary transition-colors disabled:opacity-50"
                      >
                        <span>{user.name || '-'}</span>
                        <Pencil size={14} />
                      </button>
                    ) : (
                      <span className="text-on-surface">{user.name || '-'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface">
                    {user.email}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {isAdmin && user.role === null ? (
                      <button
                        onClick={() => setRoleModalUser(user)}
                        disabled={savingUser === user.email}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest transition-colors text-xs"
                      >
                        <span>Set Role</span>
                        <ChevronDown size={14} />
                      </button>
                    ) : (
                      <span className="text-on-surface">{user.role || '-'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {user.avatar_image ? (
                      <img
                        src={user.avatar_image}
                        alt={user.name || 'Avatar'}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center">
                        <User size={20} className="text-on-surface-variant" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface">
                    {formatDateTime(user.last_login)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setStatusModalUser(user)}
                      disabled={savingUser === user.email}
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        user.is_active
                          ? 'bg-success/20 text-success hover:bg-success/30'
                          : 'bg-error/20 text-error hover:bg-error/30'
                      }`}
                    >
                      {user.is_active ? <CheckCircle size={14} /> : <XCircle size={14} />}
                      {user.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {currentUser && canResetLocalPassword(currentUser, user) ? (
                      <button
                        type="button"
                        onClick={() => setResetModalUser(user)}
                        disabled={savingUser === user.email}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                      >
                        <KeyRound size={14} />
                        Reset password
                      </button>
                    ) : (
                      <span className="text-xs text-on-surface-variant">
                        {!user.hasLocalPassword
                          ? 'Webex account'
                          : currentUser?.email.toLowerCase() === user.email.toLowerCase()
                            ? 'Current account'
                            : 'Not permitted'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Status Toggle Confirmation Modal */}
      {statusModalUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setStatusModalUser(null)}>
          <div className="bg-surface rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-hanken text-headline-md font-bold text-on-surface mb-2">
              {statusModalUser.is_active ? 'Deactivate' : 'Activate'} Account?
            </h3>
            <p className="text-on-surface-variant mb-4">
              {statusModalUser.is_active
                ? 'This will deactivate the account and prevent login.'
                : 'This will activate the account and allow login.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setStatusModalUser(null)}
                disabled={savingUser === statusModalUser.email}
                className="flex-1 px-4 py-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStatusToggle}
                disabled={savingUser === statusModalUser.email}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                  statusModalUser.is_active
                    ? 'bg-error text-on-error hover:bg-error/90'
                    : 'bg-success text-on-success hover:bg-success/90'
                }`}
              >
                {statusModalUser.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetModalUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={temporaryPassword ? undefined : closeResetModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-password-title"
        >
          <div className="w-full max-w-md rounded-xl bg-surface p-6" onClick={(event) => event.stopPropagation()}>
            <h3 id="reset-password-title" className="font-hanken text-headline-md font-bold text-on-surface">
              {temporaryPassword ? 'Temporary password created' : 'Reset password?'}
            </h3>

            {temporaryPassword ? (
              <>
                <p className="mt-2 text-sm text-on-surface-variant">
                  Copy this password now and send it to {resetModalUser.email} through your approved internal channel. It will not be shown again after closing.
                </p>
                <div className="mt-5 flex items-center gap-2 rounded-lg border border-outline-variant/50 bg-surface-container-low p-3">
                  <input
                    type={showTemporaryPassword ? 'text' : 'password'}
                    readOnly
                    value={temporaryPassword}
                    aria-label="Temporary password"
                    className="min-w-0 flex-1 bg-transparent font-mono text-sm text-on-surface outline-none"
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowTemporaryPassword((visible) => !visible)}
                    aria-label={showTemporaryPassword ? 'Hide temporary password' : 'Show temporary password'}
                    className="rounded-md p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                  >
                    {showTemporaryPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyTemporaryPassword}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-on-primary"
                  >
                    <Copy size={16} />
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="mt-3 text-xs text-on-surface-variant">
                  The user will be required to create a permanent password after entering this temporary one.
                </p>
                {resetError && <p className="mt-3 text-sm text-error" role="alert">{resetError}</p>}
                <button
                  type="button"
                  onClick={closeResetModal}
                  className="mt-5 w-full rounded-lg bg-primary px-4 py-2 font-medium text-on-primary"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <p className="mt-2 text-on-surface-variant">
                  This replaces the local password for {resetModalUser.email} and signs out existing app sessions.
                </p>
                {!resetModalUser.is_active && (
                  <div className="mt-4 flex gap-2 rounded-lg bg-warning/10 p-3 text-sm text-on-surface" role="note">
                    <AlertTriangle size={18} className="shrink-0 text-warning" />
                    This account is inactive and still cannot sign in until activated.
                  </div>
                )}
                {resetError && <p className="mt-3 text-sm text-error" role="alert">{resetError}</p>}
                <div className="mt-6 flex gap-2">
                  <button
                    type="button"
                    onClick={closeResetModal}
                    disabled={savingUser === resetModalUser.email}
                    className="flex-1 rounded-lg px-4 py-2 text-on-surface-variant hover:bg-surface-container-high disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    disabled={savingUser === resetModalUser.email}
                    className="flex-1 rounded-lg bg-primary px-4 py-2 font-medium text-on-primary disabled:opacity-50"
                  >
                    {savingUser === resetModalUser.email ? 'Generating...' : 'Generate password'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Role Selection Modal */}
      {roleModalUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setRoleModalUser(null)}>
          <div className="bg-surface rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-hanken text-headline-md font-bold text-on-surface mb-4">
              Select Role for {roleModalUser.email}
            </h3>
            <div className="space-y-2 mb-4">
              {ROLE_OPTIONS.map((role) => (
                <button
                  key={role}
                  onClick={() => handleRoleChange(role)}
                  disabled={savingUser === roleModalUser.email}
                  className="w-full text-left px-4 py-2 rounded-lg hover:bg-surface-container-high transition-colors"
                >
                  {role}
                </button>
              ))}
            </div>
            <button
              onClick={() => setRoleModalUser(null)}
              disabled={savingUser === roleModalUser.email}
              className="w-full px-4 py-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Name Edit Modal */}
      {nameModalUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setNameModalUser(null)}>
          <div className="bg-surface rounded-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-hanken text-headline-md font-bold text-on-surface mb-4">
              Edit Name
            </h3>
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              placeholder="Enter name"
              className="w-full px-4 py-2 rounded-lg bg-surface-container-low/50 border border-outline-variant/50 text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setNameModalUser(null)}
                disabled={savingUser === nameModalUser.email}
                className="flex-1 px-4 py-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleNameSave}
                disabled={savingUser === nameModalUser.email || !tempName.trim()}
                className="flex-1 px-4 py-2 rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
