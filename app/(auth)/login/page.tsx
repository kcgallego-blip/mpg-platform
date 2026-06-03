'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/authStore'
import { LogOut, UserPlus } from 'lucide-react'
import Image from 'next/image'

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, checkAuth, loginWithWebex } = useAuthStore()
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const verifyAuth = async () => {
      try {
        await checkAuth()
        setIsCheckingAuth(false)
      } catch (err) {
        setIsCheckingAuth(false)
      }
    }

    verifyAuth()
  }, [checkAuth])

  // Check for error from callback
  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam) {
      setError(errorParam.replace(/_/g, ' '))
    }
  }, [searchParams])

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (!isCheckingAuth && user) {
      router.push('/dashboard')
    }
  }, [user, isCheckingAuth, router])

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
      {/* Logo */}
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

      {/* Card */}
      <div className="glass-effect rounded-2xl p-8 backdrop-blur-glass-lg">
        <h1 className="font-hanken text-headline-md font-bold text-on-surface text-center mb-2">
          Welcome to MPG
        </h1>
        <p className="text-center text-on-surface-variant text-sm mb-8">
          Sign in with your Webex account
        </p>

        {error && (
          <div className="bg-error/10 rounded-lg p-4 mb-6 text-error text-sm">
            {error}
          </div>
        )}

        {/* Webex Login Button */}
        <button
          onClick={handleWebexLogin}
          disabled={isLoading}
          className="w-full py-sm rounded-DEFAULT bg-gradient-to-r from-primary-container to-inverse-primary hover:shadow-lg hover:shadow-primary-container/30 text-on-primary-container font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <LogOut size={18} />
          {isLoading ? 'Connecting...' : 'Continue with Webex'}
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
