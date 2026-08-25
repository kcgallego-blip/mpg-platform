'use client'

import { useEffect, useMemo, useState } from 'react'
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend } from 'chart.js'
import { Line, Doughnut } from 'react-chartjs-2'
import { useTheme } from '@/components/ThemeProvider'

ChartJS.register(
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend
)

interface ChartCardProps {
  title: string
  description: string
  data: number[]
  labels: string[]
  type: 'line' | 'doughnut'
}

const defaultChartColors = {
  primary: 'rgba(175, 198, 255, 1)',
  primarySoft: 'rgba(175, 198, 255, 0.2)',
  primaryContainer: 'rgba(52, 81, 141, 0.8)',
  secondaryContainer: 'rgba(19, 68, 144, 0.8)',
  inversePrimary: 'rgba(65, 93, 154, 0.8)',
  surface: 'rgba(255, 255, 255, 0.96)',
  onSurface: 'rgba(15, 23, 42, 1)',
  onSurfaceVariant: 'rgba(71, 85, 105, 1)',
  outline: 'rgba(148, 163, 184, 0.25)',
}

function readCssColor(styles: CSSStyleDeclaration, name: string, alpha = 1) {
  const channels = styles.getPropertyValue(`--color-${name}`).trim().split(/\s+/).join(', ')
  return channels ? `rgba(${channels}, ${alpha})` : ''
}

export default function ChartCard({
  title,
  description,
  data,
  labels,
  type,
}: ChartCardProps) {
  const { theme } = useTheme()
  const [chartColors, setChartColors] = useState(defaultChartColors)

  useEffect(() => {
    const styles = getComputedStyle(document.documentElement)
    setChartColors({
      primary: readCssColor(styles, 'primary'),
      primarySoft: readCssColor(styles, 'primary', 0.2),
      primaryContainer: readCssColor(styles, 'primary-container', 0.8),
      secondaryContainer: readCssColor(styles, 'secondary-container', 0.8),
      inversePrimary: readCssColor(styles, 'inverse-primary', 0.8),
      surface: readCssColor(styles, 'surface', 0.96),
      onSurface: readCssColor(styles, 'on-surface'),
      onSurfaceVariant: readCssColor(styles, 'on-surface-variant'),
      outline: readCssColor(styles, 'outline', 0.25),
    })
  }, [theme])

  const chartData = useMemo(() => ({
    labels,
    datasets: [
      {
        label: title,
        data,
        borderColor: chartColors.primary,
        backgroundColor: type === 'line' ? chartColors.primarySoft : [
          chartColors.primaryContainer,
          chartColors.secondaryContainer,
          chartColors.inversePrimary,
          chartColors.primarySoft,
        ],
        borderWidth: 2,
        fill: type === 'line',
        tension: 0.4,
        pointBackgroundColor: chartColors.primary,
        pointBorderColor: chartColors.primaryContainer,
        pointRadius: 6,
        pointHoverRadius: 8,
      },
    ],
  }), [chartColors, data, labels, title, type])

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: chartColors.surface,
        titleColor: chartColors.onSurface,
        bodyColor: chartColors.onSurfaceVariant,
        borderColor: chartColors.outline,
        borderWidth: 1,
        padding: 12,
        displayColors: false,
        callbacks: {
          label: function (context: any) {
            return `${context.parsed.y}`
          },
        },
      },
    },
    scales: type === 'line' ? {
      y: {
        beginAtZero: true,
        ticks: {
          color: chartColors.onSurfaceVariant,
        },
        grid: {
          color: chartColors.outline,
        },
      },
      x: {
        ticks: {
          color: chartColors.onSurfaceVariant,
        },
        grid: {
          color: chartColors.outline,
        },
      },
    } : {},
  }), [chartColors, type])

  return (
    <div className="glass-effect rounded-xl p-8 backdrop-blur-glass-lg">
      <div className="mb-6">
        <h3 className="font-hanken text-headline-md font-bold text-on-surface">{title}</h3>
        <p className="text-on-surface-variant text-sm">{description}</p>
      </div>

      <div className="h-64">
        {type === 'line' ? (
          <Line key={theme} data={chartData} options={options as any} />
        ) : (
          <Doughnut key={theme} data={chartData} options={{ ...options, maintainAspectRatio: false } as any} />
        )}
      </div>
    </div>
  )
}
