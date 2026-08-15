import { Search, X } from 'lucide-react'

type Props = {
  value: string
  onChange: (value: string) => void
  categoryName: string
  resultCount: number
  totalCount: number
}

export default function SupportSearchBar({ value, onChange, categoryName, resultCount, totalCount }: Props) {
  return (
    <div className="sticky top-[145px] z-20 -mx-gutter border-b border-outline-variant/70 bg-white/90 px-gutter py-3 backdrop-blur-glass-md">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3">
        <label className="relative min-w-[260px] flex-1">
          <span className="sr-only">Search {categoryName}</span>
          <Search size={19} className="absolute left-4 top-3 text-on-surface-variant" />
          <input
            autoFocus
            type="search"
            value={value}
            onChange={event => onChange(event.target.value)}
            placeholder={`Search ${categoryName}...`}
            className="w-full rounded-xl border border-outline-variant bg-white py-2.5 pl-11 pr-11 text-sm text-on-surface shadow-sm outline-none transition placeholder:text-outline focus:border-primary-container focus:ring-2 focus:ring-primary/40"
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="absolute right-3 top-2.5 rounded-md p-1 text-on-surface-variant hover:bg-surface-container-low"
              aria-label="Clear search"
            >
              <X size={17} />
            </button>
          )}
        </label>
        <p className="text-xs font-medium text-on-surface-variant" aria-live="polite">
          {value ? `${resultCount} of ${totalCount} rows` : `${totalCount} rows`}
        </p>
      </div>
    </div>
  )
}
