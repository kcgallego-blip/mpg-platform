'use client'

import Link from 'next/link'
import { ArrowRight, BarChart3, Shield, Zap } from 'lucide-react'
import Image from 'next/image'

export default function Home() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Mesh Gradient Background - Very light colors */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-white via-blue-50/20 to-white" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-container/5 rounded-full blur-3xl animate-blob" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-blob animation-delay-4000" />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-inverse-primary/5 rounded-full blur-3xl animate-blob animation-delay-2000" />
      </div>

        {/* Navigation */}
        <nav className="relative z-10 bg-surface/80 backdrop-blur-glass-md border-b border-outline-variant/20">
          <div className="max-w-container mx-auto px-gutter py-6 flex items-center justify-between">
            <div className="font-hanken text-2xl font-bold text-primary-container flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-container to-inverse-primary flex items-center justify-center p-1">
                <Image
                  src="/logo.png"
                  alt="MPG Logo"
                  width={24}
                  height={24}
                  className="object-contain"
                />
              </div>
              MPG
            </div>
            <div className="flex items-center gap-8">
              <a href="#features" className="text-on-surface-variant hover:text-primary-container transition-colors text-sm">Features</a>
              <a href="#about" className="text-on-surface-variant hover:text-primary-container transition-colors text-sm">About</a>
            <Link
              href="/login"
              className="px-md py-sm rounded-DEFAULT bg-primary-container hover:bg-inverse-primary text-on-primary-container hover:text-on-primary transition-all text-sm font-inter font-medium"
            >
              Login
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 max-w-container mx-auto px-gutter py-20 flex flex-col items-center text-center">
            <div className="mb-8 inline-block">
              <div className="glass-effect px-4 py-2 rounded-full">
                <p className="text-primary-container text-label-sm font-medium">🎯 Premium BPO Analytics Platform</p>
              </div>
            </div>

        <h1 className="font-hanken text-display-lg font-bold text-on-surface mb-6 leading-tight max-w-4xl">
          Drive Your Business with{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-container to-inverse-primary">
            Intelligent Analytics
          </span>
        </h1>

        <p className="text-body-lg text-on-surface-variant mb-8 max-w-2xl">
          Masterpiece Group brings you a sophisticated analytics and reporting platform designed for global outsourcing excellence. Real-time insights for smarter decisions.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-16">
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2 px-lg py-md rounded-lg bg-gradient-to-r from-primary-container to-inverse-primary hover:shadow-xl hover:shadow-primary-container/30 text-on-primary font-medium transition-all transform hover:scale-105"
          >
            Get Started <ArrowRight size={20} />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center justify-center px-lg py-md rounded-lg glass-effect glass-effect-hover text-primary-container font-medium"
          >
            Learn More
          </a>
        </div>

        {/* Mock Dashboard Preview */}
        <div className="relative w-full max-w-4xl">
          <div className="absolute inset-0 bg-gradient-to-r from-primary-container/20 via-transparent to-inverse-primary/20 rounded-2xl blur-2xl"></div>
          <div className="relative glass-effect rounded-2xl overflow-hidden p-6 backdrop-blur-glass-lg">
            <div className="bg-surface-container-highest/30 rounded-lg p-8 min-h-80">
              <div className="grid grid-cols-3 gap-4 mb-8">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="glass-effect rounded-lg p-4">
                    <div className="h-8 bg-surface-container-high rounded mb-2"></div>
                    <div className="h-4 bg-surface-container-high rounded w-2/3"></div>
                  </div>
                ))}
              </div>
              <div className="glass-effect rounded-lg p-4 h-40 bg-surface-container-high/30"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative z-10 max-w-container mx-auto px-gutter py-20">
        <div className="text-center mb-16">
          <h2 className="font-hanken text-headline-lg font-bold text-on-surface mb-4">
            Powerful Features
          </h2>
          <p className="text-on-surface-variant">Everything you need to succeed</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              icon: <BarChart3 size={32} />,
              title: 'Advanced Analytics',
              description: 'Real-time dashboards with comprehensive data visualization and insights.',
            },
            {
              icon: <Zap size={32} />,
              title: 'Instant Reports',
              description: 'Generate detailed reports in seconds with customizable metrics and filters.',
            },
            {
              icon: <Shield size={32} />,
              title: 'Enterprise Security',
              description: 'Bank-grade security with Supabase backend and encrypted data transmission.',
            },
             ].map((feature, i) => (
             <div key={i} className="glass-effect glass-effect-hover rounded-xl p-8 group">
               <div className="text-primary-container mb-4 group-hover:text-inverse-primary transition-colors">
                 {feature.icon}
               </div>
               <h3 className="font-hanken text-headline-md font-bold text-on-surface mb-2">
                 {feature.title}
               </h3>
               <p className="text-on-surface-variant">{feature.description}</p>
             </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 max-w-container mx-auto px-gutter py-20">
        <div className="glass-effect rounded-2xl p-12 text-center backdrop-blur-glass-lg">
          <h2 className="font-hanken text-headline-lg font-bold text-on-surface mb-4">
            Ready to Transform Your Analytics?
          </h2>
          <p className="text-on-surface-variant mb-8">
            Join thousands of professionals using Masterpiece Group's analytics platform.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2 px-lg py-md rounded-lg bg-gradient-to-r from-primary-container to-inverse-primary hover:shadow-xl hover:shadow-primary-container/30 text-on-primary font-medium transition-all transform hover:scale-105"
          >
            Start Free Trial <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 bg-surface/70 border-t border-outline-variant/20 backdrop-blur-glass-sm mt-20">
        <div className="max-w-container mx-auto px-gutter py-12">
           <div className="grid grid-cols-4 gap-8 mb-8">
            <div>
              <p className="font-hanken text-lg font-bold text-primary-container mb-4 flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-gradient-to-br from-primary-container to-inverse-primary flex items-center justify-center p-0.5">
                  <Image
                    src="/logo.png"
                    alt="MPG Logo"
                    width={16}
                    height={16}
                    className="object-contain"
                  />
                </div>
                MPG
              </p>
              <p className="text-on-surface-variant text-sm">
                Masterpiece Group Philippines
              </p>
            </div>
            <div>
              <p className="font-medium text-on-surface mb-3">Product</p>
              <ul className="space-y-2 text-sm text-on-surface-variant">
                <li><a href="#" className="hover:text-primary-container transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-primary-container transition-colors">Pricing</a></li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-on-surface mb-3">Company</p>
              <ul className="space-y-2 text-sm text-on-surface-variant">
                <li><a href="#" className="hover:text-primary-container transition-colors">About</a></li>
                <li><a href="#" className="hover:text-primary-container transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-on-surface mb-3">Legal</p>
              <ul className="space-y-2 text-sm text-on-surface-variant">
                <li><a href="#" className="hover:text-primary-container transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-primary-container transition-colors">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-outline-variant/20 pt-8 flex items-center justify-between text-sm text-on-surface-variant">
            <p>&copy; 2026 Masterpiece Group. All rights reserved.</p>
            <div className="flex gap-4">
              <a href="#" className="hover:text-primary-container transition-colors">Twitter</a>
              <a href="#" className="hover:text-primary-container transition-colors">LinkedIn</a>
              <a href="#" className="hover:text-primary-container transition-colors">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
