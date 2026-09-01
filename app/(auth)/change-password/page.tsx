'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import PasswordFields from '@/components/PasswordFields'
import { useAuthStore } from '@/lib/authStore'
import { evaluatePassword, getPasswordPolicyError } from '@/lib/passwordPolicy'
import { getPostLoginRoute } from '@/lib/routes'

export default function ChangePasswordPage() {
  const router = useRouter()
  const initializeSession = useAuthStore((state) => state.initializeSession)
  const [email, setEmail] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [checking, setChecking] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void fetch('/api/auth/change-password', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Password-change session is unavailable')
        if (!cancelled) setEmail(data.email)
      })
      .catch((requestError: Error) => {
        if (!cancelled) setError(requestError.message)
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const canSubmit = evaluatePassword(password).valid && password === confirmPassword

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const policyError = getPasswordPolicyError(password)
    if (policyError) {
      setError(policyError)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password, confirmPassword }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to change password')

      const user = await initializeSession(true)
      router.replace(user ? getPostLoginRoute(user.role) : '/login')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to change password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <Image src="/icon.png" alt="CLAD Logo" width={64} height={64} className="mx-auto object-contain" />
      </div>
      <div className="glass-effect rounded-2xl p-8 backdrop-blur-glass-lg">
        <h1 className="text-center font-hanken text-headline-md font-bold text-on-surface">
          Create a new password
        </h1>
        <p className="mb-6 mt-2 text-center text-sm text-on-surface-variant">
          {email ? `The temporary password for ${email} was accepted.` : 'Verify your temporary-password session.'}
        </p>

        {error && <div className="mb-5 rounded-lg bg-error/10 p-4 text-sm text-error" role="alert">{error}</div>}

        {checking ? (
          <div className="py-8 text-center" role="status">
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-outline-variant/30 border-t-primary" />
            <p className="text-sm text-on-surface-variant">Checking session...</p>
          </div>
        ) : email ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <PasswordFields
              password={password}
              confirmPassword={confirmPassword}
              onPasswordChange={setPassword}
              onConfirmPasswordChange={setConfirmPassword}
              disabled={saving}
              passwordLabel="New password"
              autoFocus
            />
            <button
              type="submit"
              disabled={saving || !canSubmit}
              className="w-full rounded-DEFAULT bg-gradient-to-r from-primary-container to-inverse-primary py-sm font-medium text-on-primary-container transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Change password and continue'}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => router.replace('/login')}
            className="w-full rounded-DEFAULT bg-primary py-sm font-medium text-on-primary"
          >
            Return to login
          </button>
        )}
      </div>
    </div>
  )
}

