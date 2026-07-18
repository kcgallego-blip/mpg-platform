import '@/styles/globals.css'

export const metadata = {
  title: 'Masterpiece Group - Analytics Platform',
  description: 'Professional BPO Analytics & Reports Dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-white text-on-surface font-inter relative min-h-screen" suppressHydrationWarning>
        {/* Mesh Gradient Background - Very light colors */}
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-white via-blue-50/20 to-white" />
          {/* Subtle blue mesh orbs - very light */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-container/5 rounded-full blur-3xl animate-blob" />
          <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-blob animation-delay-2000" />
          <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-inverse-primary/5 rounded-full blur-3xl animate-blob animation-delay-4000" />
        </div>
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  )
}
