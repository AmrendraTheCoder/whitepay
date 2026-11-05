// Tiny per-instance read cache with in-flight de-duplication ("single flight"):
// 50 checkout buttons polling the same order within the TTL cost ONE Arkiv/RPC round trip, not 50.
// Bounded (LRU-ish eviction) so memory stays flat under load.
type Entry = { at: number; ttl: number; value?: unknown; pending?: Promise<unknown> }
const store = new Map<string, Entry>()
const MAX = 2000

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, keep: (v: T) => boolean = () => true): Promise<T> {
  const now = Date.now()
  const hit = store.get(key)
  if (hit) {
    if (hit.pending) return hit.pending as Promise<T>
    if (now - hit.at < hit.ttl) { store.delete(key); store.set(key, hit); return hit.value as T } // refresh recency
  }
  const pending = load().then(
    (value) => { if (keep(value)) store.set(key, { at: Date.now(), ttl: ttlMs, value }); else store.delete(key); return value },
    (err) => { store.delete(key); throw err },
  )
  store.set(key, { at: now, ttl: ttlMs, pending })
  if (store.size > MAX) store.delete(store.keys().next().value!) // evict the least recently used
  return pending
}

export const invalidate = (prefix: string) => { for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k) }
