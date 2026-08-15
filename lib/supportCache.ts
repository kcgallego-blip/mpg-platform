'use client'

import type { SupportPayload } from './support'

const DB_NAME = 'mpg-support-knowledge-base'
const STORE_NAME = 'payloads'
const DB_VERSION = 1

type CachedSupportPayload = {
  key: string
  payload: SupportPayload
  cachedAt: number
}

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function cacheKey(email: string) {
  return email.trim().toLowerCase()
}

export async function readSupportCache(email: string): Promise<SupportPayload | null> {
  if (typeof indexedDB === 'undefined') return null
  const database = await openCache()
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(cacheKey(email))
      request.onsuccess = () => resolve((request.result as CachedSupportPayload | undefined)?.payload || null)
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

export async function writeSupportCache(email: string, payload: SupportPayload) {
  if (typeof indexedDB === 'undefined') return
  const database = await openCache()
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readwrite')
        .objectStore(STORE_NAME)
        .put({ key: cacheKey(email), payload, cachedAt: Date.now() } satisfies CachedSupportPayload)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}
