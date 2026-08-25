'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Mail, Moon, Shield, Sun, User } from 'lucide-react'
import { useAuthStore } from '@/lib/authStore'
import { useTheme } from '@/components/ThemeProvider'

function ProfileDetail({ icon, label, value }: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-outline-variant/50 bg-surface-container-low/45 px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-container/10 text-primary-container">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
        <p className="truncate font-medium text-on-surface">{value}</p>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const { theme, hasSavedPreference, toggleTheme } = useTheme()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)

  if (!user) return null

  const displayName = user.name || user.user_metadata?.name || 'Name not provided'
  const role = user.role || 'Pending role assignment'
  const isDark = theme === 'dark'

  const handleSignOut = async () => {
    setIsSigningOut(true)
    setSignOutError(null)

    try {
      await logout()
      router.replace('/login')
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : 'Failed to sign out')
      setIsSigningOut(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      <div>
        <h1 className="font-hanken text-display-lg font-bold text-on-surface">Profile</h1>
        <p className="mt-2 text-on-surface-variant">Review your account and personalize this browser.</p>
      </div>

      <section className="glass-effect rounded-2xl p-6 backdrop-blur-glass-lg sm:p-8" aria-labelledby="account-heading">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-outline-variant bg-surface-container-high">
            {user.avatar_image ? (
              <img src={user.avatar_image} alt={`${displayName} profile`} className="h-full w-full object-cover" />
            ) : (
              <User size={34} className="text-on-surface-variant" />
            )}
          </div>
          <div>
            <h2 id="account-heading" className="font-hanken text-headline-md font-bold text-on-surface">{displayName}</h2>
            <p className="text-on-surface-variant">{role}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ProfileDetail icon={<User size={20} />} label="Full name" value={displayName} />
          <ProfileDetail icon={<Mail size={20} />} label="Email address" value={user.email} />
          <ProfileDetail icon={<Shield size={20} />} label="Role" value={role} />
        </div>
      </section>

      <section className="glass-effect rounded-2xl p-6 backdrop-blur-glass-lg sm:p-8" aria-labelledby="appearance-heading">
        <div className="flex items-center justify-between gap-6">
          <div>
            <h2 id="appearance-heading" className="font-hanken text-headline-md font-bold text-on-surface">Appearance</h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {hasSavedPreference
                ? `${isDark ? 'Dark' : 'Light'} mode is saved for your account on this browser.`
                : `Following your device in ${isDark ? 'dark' : 'light'} mode until you choose.`}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={isDark}
            aria-label="Use dark mode"
            onClick={toggleTheme}
            className={`relative inline-flex h-11 w-20 shrink-0 items-center rounded-full border p-1 shadow-inner transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              isDark
                ? 'border-primary/70 bg-primary-container'
                : 'border-outline-variant bg-surface-container-high'
            }`}
          >
            <span className="sr-only">{isDark ? 'Switch to light mode' : 'Switch to dark mode'}</span>
            <span className="absolute left-2 text-on-surface-variant" aria-hidden="true"><Sun size={16} /></span>
            <span className="absolute right-2 text-on-primary-container" aria-hidden="true"><Moon size={16} /></span>
            <span
              aria-hidden="true"
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface shadow-md transition-transform duration-200 ease-out ${
                isDark ? 'translate-x-9' : 'translate-x-0'
              }`}
            >
              {isDark ? <Moon size={16} className="text-primary" /> : <Sun size={16} className="text-warning" />}
            </span>
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-error/25 bg-error-container/35 p-6 sm:p-8" aria-labelledby="account-actions-heading">
        <h2 id="account-actions-heading" className="font-hanken text-xl font-bold text-on-surface">Account actions</h2>
        <p className="mt-1 text-sm text-on-surface-variant">End your current session on this device.</p>
        {signOutError && <p className="mt-4 text-sm text-error" role="alert">{signOutError}</p>}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-error px-5 py-3 font-semibold text-on-error transition-colors hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogOut size={19} />
          {isSigningOut ? 'Signing out...' : 'Sign out'}
        </button>
      </section>
    </div>
  )
}
