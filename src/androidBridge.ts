import { useEffect } from 'react'
import { supabase } from './lib/supabase'

type NativeAndroidBridge = {
  getPushToken?: () => string
  getAppVersion?: () => string
  consumePendingThreadId?: () => string
  consumePendingView?: () => string
  consumePendingPayrollId?: () => string
  requestNotificationPermission?: () => void
  openNotificationSettings?: () => void
  peekPendingUpload?: () => string
  readPendingUploadChunk?: (offset: number, length: number) => string
  clearPendingUpload?: () => void
}

type PushTokenDetail = {
  token?: string
}

type PushOpenDetail = {
  view?: string
  threadId?: string
}

type NativeUploadInfo = {
  name?: string
  type?: string
  size?: number
}

declare global {
  interface Window {
    AromaAndroid?: NativeAndroidBridge
  }

  interface WindowEventMap {
    'aroma-push-token': CustomEvent<PushTokenDetail>
    'aroma-push-open': CustomEvent<PushOpenDetail>
    'aroma-upload-ready': CustomEvent<Record<string, never>>
  }
}

export function isAndroidApp() {
  if (typeof window === 'undefined') return false
  return Boolean(window.AromaAndroid) || /AromaCeylonAndroid\//i.test(navigator.userAgent)
}

function androidAppVersion() {
  try {
    return window.AromaAndroid?.getAppVersion?.() || 'android'
  } catch {
    return 'android'
  }
}

export function useAndroidPushRegistration(userId: string) {
  useEffect(() => {
    if (!isAndroidApp()) return

    let cancelled = false

    async function register(token?: string) {
      const cleanToken = token?.trim()
      if (!cleanToken || cancelled) return

      const { error } = await supabase.rpc('register_push_device', {
        p_token: cleanToken,
        p_platform: 'android',
        p_app_version: androidAppVersion(),
        p_device_label: navigator.userAgent.slice(0, 180),
      })

      if (error) console.warn('Push device registration failed:', error.message)
    }

    function handleToken(event: CustomEvent<PushTokenDetail>) {
      void register(event.detail?.token)
    }

    window.addEventListener('aroma-push-token', handleToken)

    try {
      window.AromaAndroid?.requestNotificationPermission?.()
      void register(window.AromaAndroid?.getPushToken?.())
    } catch (error) {
      console.warn('Android push bridge unavailable:', error)
    }

    return () => {
      cancelled = true
      window.removeEventListener('aroma-push-token', handleToken)
    }
  }, [userId])
}

export async function disableCurrentAndroidPushDevice() {
  if (!isAndroidApp()) return
  try {
    const token = window.AromaAndroid?.getPushToken?.()?.trim()
    if (!token) return
    const { error } = await supabase.rpc('disable_push_device', { p_token: token })
    if (error) console.warn('Push device disable failed:', error.message)
  } catch (error) {
    console.warn('Android push bridge unavailable:', error)
  }
}

export function openAndroidNotificationSettings() {
  if (!isAndroidApp()) return
  try {
    window.AromaAndroid?.openNotificationSettings?.()
  } catch (error) {
    console.warn('Unable to open Android notification settings:', error)
  }
}


export function consumeAndroidPendingThreadId() {
  if (!isAndroidApp()) return ''
  try {
    return window.AromaAndroid?.consumePendingThreadId?.()?.trim() || ''
  } catch {
    return ''
  }
}
export function consumeAndroidPendingView() {
  if (!isAndroidApp()) return ''
  try {
    return window.AromaAndroid?.consumePendingView?.()?.trim() || ''
  } catch {
    return ''
  }
}

export function consumeAndroidPendingPayrollId() {
  if (!isAndroidApp()) return ''
  try {
    return window.AromaAndroid?.consumePendingPayrollId?.()?.trim() || ''
  } catch {
    return ''
  }
}

export async function consumeAndroidPendingUpload() {
  if (!isAndroidApp()) return null

  try {
    const raw = window.AromaAndroid?.peekPendingUpload?.()
    if (!raw) return null

    const info = JSON.parse(raw) as NativeUploadInfo
    const totalBytes = Number(info.size || 0)
    const readChunk = window.AromaAndroid?.readPendingUploadChunk
    if (!Number.isFinite(totalBytes) || totalBytes <= 0 || !readChunk) return null

    const parts: Uint8Array[] = []
    const chunkSize = 128 * 1024
    let offset = 0

    while (offset < totalBytes) {
      const requested = Math.min(chunkSize, totalBytes - offset)
      const encoded = readChunk(offset, requested)
      if (!encoded) throw new Error('Android returned an incomplete selected image.')

      const binary = window.atob(encoded)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
      }
      parts.push(bytes)
      offset += bytes.byteLength
    }

    const type = info.type || 'image/jpeg'
    const blob = new Blob(parts, { type })
    const name = info.name || `bill-${Date.now()}.jpg`
    const file = new File([blob], name, { type, lastModified: Date.now() })

    window.AromaAndroid?.clearPendingUpload?.()
    return file
  } catch (error) {
    console.warn('Unable to restore Android selected image:', error)
    return null
  }
}

