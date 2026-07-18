'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/authStore'
import { LogIn, Lock, Mail, UserPlus, Eye, EyeOff, CheckCircle, X } from 'lucide-react'
import Image from 'next/image'

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, checkAuth, loginWithEmail, loginWithWebex, rehydrateFromStorage } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
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
    const registeredParam = searchParams.get('registered')

    if (registeredParam) {
      setToastMessage('Account is currently in pending approval. Please reach out to IT Kevin for further assistance.')
      setShowToast(true)
      const timer = setTimeout(() => setShowToast(false), 7000)
      return () => clearTimeout(timer)
    }
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
      if (err.message?.includes('pending approval')) {
        setToastMessage('Account is currently in pending approval. Please reach out to IT Kevin for further assistance.')
        setShowToast(true)
        const timer = setTimeout(() => setShowToast(false), 7000)
        return () => clearTimeout(timer)
      }
      setError(err.message || 'Failed to login')
    } finally {
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
        <div className="text-center mb-8">
          <Image
            src="/icon.png"
            alt="CLAD Logo"
            width={60}
            height={60}
            className="mx-auto mb-2 object-contain"
          />
          <p className="text-on-surface-variant text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-out">
        {showToast && (
          <div className="bg-primary-container/90 backdrop-blur-glass-sm rounded-lg px-6 py-4 flex items-center gap-3 shadow-lg animate-[slideDown_0.3s_ease-out]">
            <CheckCircle className="text-on-primary-container" size={20} />
            <span className="text-on-primary-container text-sm font-medium">
              {toastMessage}
            </span>
            <button
              onClick={() => setShowToast(false)}
              className="text-on-primary-container/70 hover:text-on-primary-container transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Image
              src="/icon.png"
              alt="CLAD Logo"
              width={64}
              height={64}
              className="object-contain"
            />
            <Image
              src="/logo-name.png"
              alt="CLAD Platform"
              width={200}
              height={36}
              className="object-contain"
            />
          </div>
        </div>

        <div className="glass-effect rounded-2xl p-8 backdrop-blur-glass-lg">
          <h1 className="font-hanken text-headline-md font-bold text-on-surface text-center mb-2">
            Login
          </h1>

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
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Insert password"
                  className="w-full rounded-DEFAULT border border-outline-variant/50 bg-surface-container-low/50 py-sm pl-10 pr-12 text-on-surface placeholder-on-surface-variant/50 transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
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
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-DEFAULT border border-secondary-container bg-secondary-container/10 py-sm font-medium text-secondary-container transition-all hover:bg-secondary-container/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Image
              src="/webex-logo.svg"
              alt="Webex logo"
              width={24}
              height={24}
              className="object-contain"
            />
            Sign in using Webex
          </button>

          <Link
            href="/register"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-DEFAULT border border-transparent bg-transparent py-sm text-sm font-medium text-secondary-container hover:underline"
          >
            <UserPlus size={18} />
            Register without Webex
          </Link>
        </div>
      </div>
    </>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image
            src="/icon.png"
            alt="CLAD Logo"
            width={60}
            height={60}
            className="mx-auto mb-2 object-contain"
          />
          <p className="text-on-surface-variant text-sm">Loading...</p>
        </div>
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  )
}