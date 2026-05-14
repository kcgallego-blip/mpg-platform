'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/authStore'
import { LogOut } from 'lucide-react'
import Image from 'next/image'

export default function LoginPage() {
  const router = useRouter()
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
      </div>
    </div>
  )
}
