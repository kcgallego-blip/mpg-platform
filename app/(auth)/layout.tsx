import { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Mesh Gradient Background - Very light colors */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-blue-50/20 to-white" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-container/5 rounded-full blur-3xl animate-blob" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-blob animation-delay-4000" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-inverse-primary/5 rounded-full blur-3xl animate-blob animation-delay-2000" />
      </div>
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  )
}
