import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Upload Stats | CLAD Platform',
  description: 'Upload agent performance statistics',
}

export default function StatsUploadLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
