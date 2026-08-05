import { Capacitor } from '@capacitor/core'

// Thin wrapper around @capacitor/local-notifications so any feature (Calendar
// today; habit reminders, focus-session-done, subscription/budget alerts
// later) can schedule/cancel real OS notifications through one shared API
// instead of each screen touching the plugin directly. No-ops safely on web.

let permissionAsked = false

async function getPlugin() {
  if (!Capacitor.isNativePlatform()) return null
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  return LocalNotifications
}

// Call once (e.g. on app load, or the first time a feature wants to notify).
// Safe to call repeatedly — only prompts the user once per install.
export async function ensureNotificationPermission() {
  const plugin = await getPlugin()
  if (!plugin) return false
  if (permissionAsked) {
    const { display } = await plugin.checkPermissions()
    return display === 'granted'
  }
  permissionAsked = true
  const { display } = await plugin.requestPermissions()
  return display === 'granted'
}

// Deterministic small int ID from any string, so callers can pass a stable
// key (e.g. a calendar_event UUID) instead of managing numeric IDs themselves.
export function notificationId(key) {
  let h = 0
  for (let i = 0; i < key.length; i++) { h = (h * 31 + key.charCodeAt(i)) | 0 }
  return Math.abs(h) % 2147483647
}

// at: JS Date in the future. Silently skipped (not scheduled, not thrown) if
// in the past, on web, or if permission was never granted — callers don't
// need to fork their logic per-platform.
export async function scheduleNotification({ id, title, body, at }) {
  const plugin = await getPlugin()
  if (!plugin || !at || at.getTime() <= Date.now()) return
  const granted = await ensureNotificationPermission()
  if (!granted) return
  await plugin.schedule({
    notifications: [{ id, title, body, schedule: { at } }],
  })
}

export async function cancelNotification(id) {
  const plugin = await getPlugin()
  if (!plugin) return
  await plugin.cancel({ notifications: [{ id }] })
}

export async function cancelNotifications(ids) {
  const plugin = await getPlugin()
  if (!plugin || !ids.length) return
  await plugin.cancel({ notifications: ids.map(id => ({ id })) })
}
