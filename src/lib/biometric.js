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
  if (!plugin) return { available: false, reason: 'Not running on a native device.' }
  try {
    const result = await plugin.checkBiometry()
    // isAvailable can be false even with real hardware/enrollment — e.g. some
    // Android OEMs restrict biometric hardware to system-level unlock only,
    // never exposing it to third-party apps. `reason`/`code` say why.
    return { available: !!result.isAvailable, reason: result.reason || null, code: result.code || null, biometryType: result.biometryType }
  } catch (e) {
    return { available: false, reason: e.message || 'checkBiometry() threw an error.' }
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
