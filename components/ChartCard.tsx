'use client'

import { useEffect, useRef } from 'react'
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend } from 'chart.js'
import { Line, Doughnut } from 'react-chartjs-2'

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

export default function ChartCard({
  title,
  description,
  data,
  labels,
  type,
}: ChartCardProps) {
  const chartData = {
    labels,
    datasets: [
      {
        label: title,
        data,
        borderColor: '#afc6ff',
        backgroundColor: type === 'line' ? 'rgba(175, 198, 255, 0.2)' : [
          'rgba(52, 81, 141, 0.8)',
          'rgba(19, 68, 144, 0.8)',
          'rgba(65, 93, 154, 0.8)',
          'rgba(175, 198, 255, 0.6)',
        ],
        borderWidth: 2,
        fill: type === 'line',
        tension: 0.4,
        pointBackgroundColor: '#afc6ff',
        pointBorderColor: '#34518d',
        pointRadius: 6,
        pointHoverRadius: 8,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        titleColor: '#0f172a',
        bodyColor: '#475569',
        borderColor: '#e2e8f0',
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
          color: '#475569',
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.2)',
        },
      },
      x: {
        ticks: {
          color: '#475569',
        },
        grid: {
          color: 'rgba(148, 163, 184, 0.2)',
        },
      },
    } : {},
  }

  return (
    <div className="glass-effect rounded-xl p-8 backdrop-blur-glass-lg">
      <div className="mb-6">
        <h3 className="font-hanken text-headline-md font-bold text-on-surface">{title}</h3>
        <p className="text-on-surface-variant text-sm">{description}</p>
      </div>

      <div className="h-64">
        {type === 'line' ? (
          <Line data={chartData} options={options as any} />
        ) : (
          <Doughnut data={chartData} options={{ ...options, maintainAspectRatio: false } as any} />
        )}
      </div>
    </div>
  )
}
