import { CheckCircle2, PlusCircle, Sparkles } from 'lucide-react'
import type { ChangelogCategory, ChangelogRelease } from '@/lib/changelog'

const CATEGORY_DETAILS: Record<ChangelogCategory, {
  label: string
  icon: typeof PlusCircle
  color: string
}> = {
  added: {
    label: 'Added',
    icon: PlusCircle,
    color: 'text-primary-container bg-primary/20',
  },
  improved: {
    label: 'Improved',
    icon: Sparkles,
    color: 'text-secondary-container bg-secondary/20',
  },
  fixed: {
    label: 'Fixed',
    icon: CheckCircle2,
    color: 'text-on-success-container bg-success-container',
  },
}

const DATE_FORMATTER = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

export default function ChangelogReleaseCard({
  release,
  compact = false,
}: {
  release: ChangelogRelease
  compact?: boolean
}) {
  return (
    <article className={`rounded-xl border border-outline-variant bg-surface/90 shadow-sm ${compact ? 'p-4' : 'p-6'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary-container px-2.5 py-1 text-xs font-semibold text-on-primary-container">
              v{release.version}
            </span>
            <time className="text-xs text-on-surface-variant" dateTime={release.publishedAt}>
              {DATE_FORMATTER.format(new Date(release.publishedAt))}
            </time>
          </div>
          <h2 className={`${compact ? 'text-lg' : 'text-xl'} font-hanken font-bold text-on-surface`}>
            {release.title}
          </h2>
        </div>
      </div>

      <div className={`${compact ? 'mt-4 space-y-4' : 'mt-6 space-y-5'}`}>
        {(Object.keys(CATEGORY_DETAILS) as ChangelogCategory[]).map((category) => {
          const items = release.changes[category]
          if (items.length === 0) return null
          const details = CATEGORY_DETAILS[category]
          const Icon = details.icon

          return (
            <section key={category} aria-labelledby={`release-${release.sequence}-${category}`}>
              <h3
                id={`release-${release.sequence}-${category}`}
                className={`mb-2 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${details.color}`}
              >
                <Icon size={14} aria-hidden="true" />
                {details.label}
              </h3>
              <ul className="space-y-2 pl-5 text-sm leading-6 text-on-surface-variant">
                {items.map((item) => (
                  <li key={item} className="list-disc pl-1">{item}</li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </article>
  )
}
