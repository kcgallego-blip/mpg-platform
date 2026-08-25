import '@/styles/globals.css'
import AuthSessionManager from '@/components/AuthSessionManager'
import ChangelogMonitor from '@/components/changelogs/ChangelogMonitor'
import ThemeProvider from '@/components/ThemeProvider'

const themeBootstrapScript = `
(() => {
  try {
    const cached = localStorage.getItem('mpg_active_theme');
    const theme = cached === 'light' || cached === 'dark'
      ? cached
      : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (_) {
    const theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }
})();`

export const metadata = {
  title: 'CLAD Portal',
  description: 'Professional BPO Analytics & Reports Dashboard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <link rel="icon" href="/icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-on-surface font-inter relative min-h-screen" suppressHydrationWarning>
        <ThemeProvider>
          <AuthSessionManager />
          <ChangelogMonitor />
          <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
            <div className="app-page-gradient absolute inset-0" />
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-container/5 rounded-full blur-3xl animate-blob" />
            <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-primary/10 rounded-full blur-3xl animate-blob animation-delay-2000" />
            <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-inverse-primary/5 rounded-full blur-3xl animate-blob animation-delay-4000" />
          </div>
          <div className="relative z-10">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
