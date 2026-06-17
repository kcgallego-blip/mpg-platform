'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Lock, Mail, User } from 'lucide-react'
import Image from 'next/image'
import { useAuthStore } from '@/lib/authStore'

const EMAIL_DOMAIN = '@m-piece.com'

export default function RegisterPage() {
  const router = useRouter()
  const { register } = useAuthStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const normalizedName = name.trim()
    const normalizedEmail = email.trim().toLowerCase()

    if (normalizedName.length < 2) {
      setError('Name must be at least 2 characters')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !normalizedEmail.endsWith(EMAIL_DOMAIN)) {
      setError('Email is not valid')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setIsLoading(true)

    try {
      await register(normalizedEmail, normalizedName, password)
      router.push('/login?registered=1')
    } catch (err: any) {
      setError(err.message || 'Failed to register account')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <div className="mb-2 flex items-center justify-center gap-2 font-hanken text-3xl font-bold text-primary-container">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary-container to-inverse-primary p-1">
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
        <p className="text-sm text-on-surface-variant">Masterpiece Group Analytics</p>
      </div>

      <div className="glass-effect rounded-2xl p-8 backdrop-blur-glass-lg">
        <h1 className="mb-2 text-center font-hanken text-headline-md font-bold text-on-surface">
          Register Account
        </h1>
        <p className="mb-8 text-center text-sm text-on-surface-variant">
          Submit your details for admin approval.
        </p>

        {error && (
          <div className="mb-6 rounded-lg bg-error/10 p-4 text-sm text-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="name" className="mb-2 block text-label-sm font-medium text-on-surface">
              Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
              <input
                id="name"
                type="text"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Insert your name"
                className="w-full rounded-DEFAULT border border-outline-variant/50 bg-surface-container-low/50 py-sm pl-10 pr-4 text-on-surface placeholder-on-surface-variant/50 transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
          </div>

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
                minLength={8}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-DEFAULT bg-gradient-to-r from-primary-container to-inverse-primary py-sm font-medium text-on-primary-container transition-all hover:shadow-lg hover:shadow-primary-container/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? 'Registering...' : 'Register'}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-on-surface-variant">
          Already registered?{' '}
          <Link href="/login" className="font-medium text-primary transition-colors hover:text-inverse-primary">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
