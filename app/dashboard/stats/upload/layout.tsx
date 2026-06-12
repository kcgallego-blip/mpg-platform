import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Upload Stats | MPG Platform',
  description: 'Upload agent performance statistics',
}

export default function StatsUploadLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
