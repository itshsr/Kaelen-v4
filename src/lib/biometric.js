import { Capacitor } from '@capacitor/core'

// Wraps @aparajita/capacitor-biometric-auth. Biometric unlock is a same-device
// convenience alternative to the PIN, not a replacement for it — success here
// means "this is the device owner, per the OS," equivalent trust to entering
// the correct PIN on this same phone. No-ops (unavailable) on web.

async function getPlugin() {
  if (!Capacitor.isNativePlatform()) return null
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
  return BiometricAuth
}

export async function isBiometricAvailable() {
  const plugin = await getPlugin()
  if (!plugin) return false
  try {
    const result = await plugin.checkBiometry()
    return !!result.isAvailable
  } catch {
    return false
  }
}

// Resolves true on successful authentication, false on cancel/failure —
// callers don't need to catch, just check the boolean.
export async function authenticateWithBiometrics(reason = 'Unlock this section') {
  const plugin = await getPlugin()
  if (!plugin) return false
  try {
    await plugin.authenticate({ reason, cancelTitle: 'Use PIN instead' })
    return true
  } catch {
    return false
  }
}
