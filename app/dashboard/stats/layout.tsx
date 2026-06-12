import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Stats | MPG Platform',
  description: 'Agent and team performance statistics',
}

export default function StatsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
