'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/authStore'
import { Eye, EyeOff, Mail, Lock, User, Building2 } from 'lucide-react'
import Image from 'next/image'

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  const router = useRouter()
  const { register } = useAuthStore()

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validation
    if (!agreedToTerms) {
      setError('Please agree to the Terms of Service')
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setIsLoading(true)

    try {
      await register(formData.email, formData.password, {
        name: formData.name,
        company: formData.company,
      })
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed to create account')
    } finally {
      setIsLoading(false)
    }
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
          Create Account
        </h1>
        <p className="text-center text-on-surface-variant text-sm mb-8">
          Join us to get started with analytics
        </p>

        {error && (
          <div className="bg-error/10 rounded-lg p-4 mb-6 text-error text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name Input */}
          <div>
            <label htmlFor="name" className="block text-on-surface text-label-sm font-medium mb-2">
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
              <input
                id="name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="John Doe"
                className="w-full pl-10 pr-4 py-sm rounded-DEFAULT bg-surface-container-low/50 border border-outline-variant/50 text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                required
              />
            </div>
          </div>

          {/* Company Input */}
          <div>
            <label htmlFor="company" className="block text-on-surface text-label-sm font-medium mb-2">
              Company Name
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
              <input
                id="company"
                type="text"
                name="company"
                value={formData.company}
                onChange={handleChange}
                placeholder="Your Company"
                className="w-full pl-10 pr-4 py-sm rounded-DEFAULT bg-surface-container-low/50 border border-outline-variant/50 text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          {/* Email Input */}
          <div>
            <label htmlFor="email" className="block text-on-surface text-label-sm font-medium mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
              <input
                id="email"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-sm rounded-DEFAULT bg-surface-container-low/50 border border-outline-variant/50 text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label htmlFor="password" className="block text-on-surface text-label-sm font-medium mb-2">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-sm rounded-DEFAULT bg-surface-container-low/50 border border-outline-variant/50 text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Confirm Password Input */}
          <div>
            <label htmlFor="confirmPassword" className="block text-on-surface text-label-sm font-medium mb-2">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-sm rounded-DEFAULT bg-surface-container-low/50 border border-outline-variant/50 text-on-surface placeholder-on-surface-variant/50 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary transition-colors"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Terms Checkbox */}
          <label className="flex items-start gap-2 cursor-pointer mt-6">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="w-4 h-4 rounded border-outline-variant/50 bg-surface-container-low accent-primary mt-1"
            />
            <span className="text-on-surface-variant text-sm">
              I agree to the{' '}
              <a href="#" className="text-primary hover:text-inverse-primary transition-colors">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="#" className="text-primary hover:text-inverse-primary transition-colors">
                Privacy Policy
              </a>
            </span>
          </label>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !agreedToTerms}
            className="w-full py-sm rounded-DEFAULT bg-gradient-to-r from-primary-container to-inverse-primary hover:shadow-lg hover:shadow-primary-container/30 text-on-primary-container font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-6"
          >
            {isLoading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-outline-variant/30"></div>
          <span className="text-on-surface-variant text-xs">OR</span>
          <div className="flex-1 h-px bg-outline-variant/30"></div>
        </div>

        {/* Social Login */}
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className="py-sm rounded-DEFAULT glass-effect glass-effect-hover text-on-surface text-sm font-medium transition-all">
            Google
          </button>
          <button type="button" className="py-sm rounded-DEFAULT glass-effect glass-effect-hover text-on-surface text-sm font-medium transition-all">
            GitHub
          </button>
        </div>

        {/* Login Link */}
        <p className="text-center text-on-surface-variant text-sm mt-8">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:text-inverse-primary font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
