type CacheEntry<T> = {
  expiresAt: number
  value: T
}

const CACHE_PREFIX = 'mpg:v2:'
const memoryCache = new Map<string, CacheEntry<unknown>>()

const getStorage = () => {
  if (typeof window === 'undefined') return null

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function getClientCache<T>(key: string): T | null {
  const cacheKey = `${CACHE_PREFIX}${key}`
  const now = Date.now()
  const memoryEntry = memoryCache.get(cacheKey) as CacheEntry<T> | undefined

  if (memoryEntry) {
    if (memoryEntry.expiresAt > now) return memoryEntry.value
    memoryCache.delete(cacheKey)
  }

  const storage = getStorage()
  if (!storage) return null

  try {
    const rawEntry = storage.getItem(cacheKey)
    if (!rawEntry) return null

    const entry = JSON.parse(rawEntry) as CacheEntry<T>
    if (!entry || typeof entry.expiresAt !== 'number' || entry.expiresAt <= now) {
      storage.removeItem(cacheKey)
      return null
    }

    memoryCache.set(cacheKey, entry)
    return entry.value
  } catch {
    storage.removeItem(cacheKey)
    return null
  }
}

export function setClientCache<T>(key: string, value: T, ttlMs: number): void {
  const cacheKey = `${CACHE_PREFIX}${key}`
  const entry: CacheEntry<T> = {
    expiresAt: Date.now() + ttlMs,
    value,
  }

  memoryCache.set(cacheKey, entry)

  const storage = getStorage()
  if (!storage) return

  try {
    storage.setItem(cacheKey, JSON.stringify(entry))
  } catch {
    // Storage quotas are best-effort; the in-memory cache still prevents repeats.
  }
}

export function invalidateClientCache(prefix: string): void {
  const cachePrefix = `${CACHE_PREFIX}${prefix}`

  for (const key of Array.from(memoryCache.keys())) {
    if (key.startsWith(cachePrefix)) memoryCache.delete(key)
  }

  const storage = getStorage()
  if (!storage) return

  try {
    const keysToRemove: string[] = []

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(cachePrefix)) keysToRemove.push(key)
    }

    keysToRemove.forEach((key) => storage.removeItem(key))
  } catch {
    // Cache invalidation is best-effort when browser storage is unavailable.
  }
}
