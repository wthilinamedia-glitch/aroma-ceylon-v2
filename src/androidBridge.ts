import { useEffect } from 'react'
import { supabase } from './lib/supabase'

type NativeAndroidBridge = {
  getPushToken?: () => string
  getAppVersion?: () => string
  consumePendingThreadId?: () => string
  requestNotificationPermission?: () => void
  openNotificationSettings?: () => void
}

type PushTokenDetail = {
  token?: string
}

type PushOpenDetail = {
  view?: string
  threadId?: string
}

declare global {
  interface Window {
    AromaAndroid?: NativeAndroidBridge
  }

  interface WindowEventMap {
    'aroma-push-token': CustomEvent<PushTokenDetail>
    'aroma-push-open': CustomEvent<PushOpenDetail>
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
