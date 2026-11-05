// Best-effort per-instance log of what this shop's server did per order (shown in the live console).
// A real shop writes this to its database.
const log = new Map<string, { at: number; msg: string }[]>()
export function recordEvent(orderId: string, msg: string) {
  const k = orderId.toLowerCase()
  log.set(k, [...(log.get(k) ?? []), { at: Date.now(), msg }].slice(-10))
  if (log.size > 500) log.delete(log.keys().next().value!)
}
export const eventsFor = (orderId: string) => log.get(orderId.toLowerCase()) ?? []
