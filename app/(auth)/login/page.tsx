'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/authStore'
import { LogIn, Lock, Mail, UserPlus } from 'lucide-react'
import Image from 'next/image'

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, checkAuth, loginWithEmail, loginWithWebex, rehydrateFromStorage } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const hasCheckedAuth = useRef(false)

  useEffect(() => {
    if (hasCheckedAuth.current) return

    hasCheckedAuth.current = true

    const verifyAuth = async () => {
      try {
        rehydrateFromStorage()
        await checkAuth()
        setIsCheckingAuth(false)
      } catch (err) {
        setIsCheckingAuth(false)
      }
    }

    verifyAuth()
  }, [checkAuth, rehydrateFromStorage])

  useEffect(() => {
    const errorParam = searchParams.get('error')
    const registeredParam = searchParams.get('registered')

    setError(errorParam ? errorParam.replace(/_/g, ' ') : null)
    setSuccess(registeredParam ? 'Registration submitted. Your account is pending approval.' : null)
  }, [searchParams])

  useEffect(() => {
    if (!isCheckingAuth && user) {
      router.push('/dashboard')
    }
  }, [user, isCheckingAuth, router])

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      await loginWithEmail(email.trim(), password)
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed to login')
      setIsLoading(false)
    }
  }

  const handleWebexLogin = async () => {
    setError(null)
    setIsLoading(true)

    try {
      await loginWithWebex()
    } catch (err: any) {
      setError(err.message || 'Failed to connect with Webex')
      setIsLoading(false)
    }
  }

  if (isCheckingAuth) {
    return (
      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="font-hanken text-3xl font-bold text-primary-container mb-2">MPG</div>
          <p className="text-on-surface-variant text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <div className="font-hanken text-3xl font-bold text-primary-container mb-2 flex items-center justify-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-container to-inverse-primary flex items-center justify-center p-1">
            <Image
              src="/logo.png"
              alt="MPG Logo"
              width={28}
              height={28}
              className="object-contain"
            />
          </div>
          MPG
        </div>
        <p className="text-on-surface-variant text-sm">Masterpiece Group Analytics</p>
      </div>

      <div className="glass-effect rounded-2xl p-8 backdrop-blur-glass-lg">
        <h1 className="font-hanken text-headline-md font-bold text-on-surface text-center mb-2">
          Welcome to MPG
        </h1>
        <p className="text-center text-on-surface-variant text-sm mb-8">
          Sign in with your MPG account
        </p>

        {success && (
          <div className="bg-primary-container/10 rounded-lg p-4 mb-6 text-primary-container text-sm">
            {success}
          </div>
        )}

        {error && (
          <div className="bg-error/10 rounded-lg p-4 mb-6 text-error text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-label-sm font-medium text-on-surface">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
              <input
                id="email"
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Insert email address here"
                className="w-full rounded-DEFAULT border border-outline-variant/50 bg-surface-container-low/50 py-sm pl-10 pr-4 text-on-surface placeholder-on-surface-variant/50 transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-label-sm font-medium text-on-surface">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
              <input
                id="password"
                type="password"
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Insert password"
                className="w-full rounded-DEFAULT border border-outline-variant/50 bg-surface-container-low/50 py-sm pl-10 pr-4 text-on-surface placeholder-on-surface-variant/50 transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-sm rounded-DEFAULT bg-gradient-to-r from-primary-container to-inverse-primary hover:shadow-lg hover:shadow-primary-container/30 text-on-primary-container font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <LogIn size={18} />
            {isLoading ? 'Logging in...' : 'Sign in'}
          </button>
        </form>

        <button
          onClick={handleWebexLogin}
          disabled={isLoading}
          className="mt-4 w-full py-sm rounded-DEFAULT border border-outline-variant/60 bg-surface/70 text-on-surface font-medium transition-all hover:border-primary hover:bg-surface-container-high disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <LogIn size={18} />
          Continue with Webex
        </button>

        <Link
          href="/register"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-DEFAULT border border-outline-variant/60 bg-surface/70 py-sm text-sm font-medium text-on-surface transition-all hover:border-primary hover:bg-surface-container-high"
        >
          <UserPlus size={18} />
          Register without Webex
        </Link>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="w-full max-w-md">
        <div className="text-center">
          <div className="font-hanken text-3xl font-bold text-primary-container mb-2">MPG</div>
          <p className="text-on-surface-variant text-sm">Loading...</p>
        </div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  )
}
