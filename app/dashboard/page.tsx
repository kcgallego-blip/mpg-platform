'use client'

import { useState } from 'react'
import { useAuthStore } from '@/lib/authStore'
import { BarChart3, TrendingUp, Users, DollarSign, ArrowUpRight, ArrowDownRight, ClipboardList } from 'lucide-react'
import Link from 'next/link'
import StatCard from '@/components/StatCard'
import ChartCard from '@/components/ChartCard'

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [timeRange, setTimeRange] = useState('30d')

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div>
        <h1 className="font-hanken text-display-lg font-bold text-on-surface mb-2">
          Welcome back, {user?.user_metadata?.name || user?.email}
        </h1>
        <p className="text-on-surface-variant">
          Here's your analytics overview for the last {timeRange === '7d' ? '7 days' : '30 days'}
        </p>
      </div>

      {/* Time Range Selector */}
      <div className="flex gap-3">
        {['7d', '30d', '90d'].map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-4 py-2 rounded-DEFAULT text-sm font-medium transition-all ${
              timeRange === range
                ? 'bg-primary-container text-on-primary-container'
                : 'glass-effect glass-effect-hover text-on-surface-variant'
            }`}
          >
            {range === '7d' ? 'Last 7 Days' : range === '30d' ? 'Last 30 Days' : 'Last 90 Days'}
          </button>
        ))}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={<Users size={24} />}
          label="Active Users"
          value="2,847"
          change="+12.5%"
          trend="up"
          color="primary"
        />
        <StatCard
          icon={<DollarSign size={24} />}
          label="Total Revenue"
          value="$124,569"
          change="+8.2%"
          trend="up"
          color="secondary"
        />
        <StatCard
          icon={<BarChart3 size={24} />}
          label="Total Projects"
          value="342"
          change="+4.1%"
          trend="up"
          color="tertiary"
        />
        <StatCard
          icon={<TrendingUp size={24} />}
          label="Growth Rate"
          value="24.5%"
          change="-2.3%"
          trend="down"
          color="primary"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Revenue Over Time"
          description="Monthly revenue trend"
          data={[65, 59, 80, 81, 56, 85, 92]}
          labels={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']}
          type="line"
        />
        <ChartCard
          title="Project Distribution"
          description="By status"
          data={[120, 150, 90, 70]}
          labels={['Active', 'Completed', 'On Hold', 'Pending']}
          type="doughnut"
        />
      </div>

        {/* Recent Activity */}
        <div className="glass-effect rounded-xl p-8 backdrop-blur-glass-lg">
          <h2 className="font-hanken text-headline-md font-bold text-on-surface mb-6">
            Recent Activity
          </h2>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="flex items-center justify-between pb-4 border-b border-outline-variant/20 last:border-0">
                <div>
                  <p className="text-on-surface font-medium">Project #{1000 + item} Updated</p>
                  <p className="text-on-surface-variant text-sm">2 hours ago</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-primary-container text-sm font-medium">+$4,200</span>
                  <div className="bg-primary-container/30 p-2 rounded-lg">
                    <ArrowUpRight size={16} className="text-primary-container" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* IT Report CTA */}
        <div className="glass-effect rounded-xl p-8 backdrop-blur-glass-lg">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-container to-inverse-primary flex items-center justify-center">
                <ClipboardList size={24} className="text-on-primary" />
              </div>
              <div>
                <h2 className="font-hanken text-headline-sm font-bold text-on-surface">
                  Need IT Support?
                </h2>
                <p className="text-on-surface-variant text-sm">
                  Submit an IT report and our team will assist you
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/it-report"
              className="flex items-center gap-2 px-lg py-md rounded-lg bg-gradient-to-r from-primary to-primary-container hover:from-primary/90 hover:to-primary-container/90 text-on-primary font-medium transition-all whitespace-nowrap"
            >
              Submit IT Report
              <ArrowUpRight size={20} className="rotate-[-45deg]" />
            </Link>
          </div>
        </div>
    </div>
  )
}
