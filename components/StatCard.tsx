import { ReactNode } from 'react'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface StatCardProps {
  icon: ReactNode
  label: string
  value: string
  change: string
  trend: 'up' | 'down'
  color: string
}

const colorClasses = {
  primary: 'text-on-primary bg-primary-container',
  secondary: 'text-on-secondary bg-secondary-container',
  tertiary: 'text-on-tertiary bg-tertiary-container',
}

export default function StatCard({
  icon,
  label,
  value,
  change,
  trend,
  color,
}: StatCardProps) {
  const colorClass = colorClasses[color as keyof typeof colorClasses] || colorClasses.primary

  return (
    <div className="glass-effect glass-effect-hover rounded-xl p-6 backdrop-blur-glass-lg">
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-lg ${colorClass}`}>
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-sm font-medium ${
          trend === 'up' ? 'text-emerald-400' : 'text-red-400'
        }`}>
          {trend === 'up' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
          {change}
        </div>
      </div>

      <p className="text-on-surface-variant text-sm font-medium mb-2">{label}</p>
      <p className="font-hanken text-3xl font-bold text-on-surface">{value}</p>
    </div>
  )
}
