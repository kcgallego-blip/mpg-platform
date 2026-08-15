import { BookOpen, ChevronDown, Zap } from 'lucide-react'
import type { SupportCategory } from '@/lib/support'

type Props = {
  categories: SupportCategory[]
  activeCategoryId: string
  onSelect: (categoryId: string) => void
}

export default function SupportSecondaryHeader({ categories, activeCategoryId, onSelect }: Props) {
  const quickCategories = categories
    .filter(category => category.isQuickAccess)
    .sort((a, b) => a.quickAccessOrder - b.quickAccessOrder || a.name.localeCompare(b.name))
    .slice(0, 4)

  return (
    <section className="sticky top-20 z-30 -mx-gutter border-b border-outline-variant bg-white/95 px-gutter py-3 shadow-sm backdrop-blur-glass-md">
      <div className="mx-auto flex max-w-[1440px] flex-nowrap items-center gap-3">
        <div className="mr-2 flex min-w-fit items-center gap-2">
          <div className="rounded-lg bg-primary-container p-2 text-white">
            <BookOpen size={19} />
          </div>
          <div>
            <p className="font-hanken text-lg font-bold leading-tight text-on-surface">Support Knowledge Base</p>
            <p className="text-xs text-on-surface-variant">Live-call reference</p>
          </div>
        </div>

        <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <span className="sr-only">Select category</span>
          <select
            value={activeCategoryId}
            onChange={event => onSelect(event.target.value)}
            className="w-full appearance-none rounded-lg border border-outline-variant bg-surface px-4 py-2.5 pr-10 text-sm font-semibold text-on-surface outline-none transition focus:border-primary-container focus:ring-2 focus:ring-primary/40"
          >
            {categories.map(category => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-3 top-3 text-on-surface-variant" />
        </label>

        {quickCategories.length > 0 && (
          <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto py-1 scrollbar-hidden" aria-label="Quick access categories">
            <Zap size={15} className="text-primary-container" />
            {quickCategories.map(category => {
              const active = category.id === activeCategoryId
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => onSelect(category.id)}
                  aria-pressed={active}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'border-primary-container bg-primary-container text-white'
                      : 'border-outline-variant bg-white text-on-surface-variant hover:border-primary-container hover:text-primary-container'
                  }`}
                >
                  {category.name}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
