import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type FirebaseServiceAccount = {
  project_id: string
  client_email: string
  private_key: string
}

type PushRequest = {
  event?: 'thread_created' | 'thread_reply'
  thread_id?: string
}

type CachedAccessToken = {
  token: string
  expiresAt: number
}

let cachedAccessToken: CachedAccessToken | null = null

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function base64UrlText(value: string) {
  return btoa(value)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64UrlBytes(value: Uint8Array) {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function pemToArrayBuffer(pem: string) {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

async function firebaseAccessToken(account: FirebaseServiceAccount) {
  const nowMs = Date.now()
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60_000 > nowMs) {
    return cachedAccessToken.token
  }

  const now = Math.floor(nowMs / 1000)
  const header = base64UrlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64UrlText(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const unsignedJwt = `${header}.${claim}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsignedJwt),
  ))
  const assertion = `${unsignedJwt}.${base64UrlBytes(signature)}`

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!tokenResponse.ok) {
    throw new Error(`Firebase OAuth failed: ${await tokenResponse.text()}`)
  }

  const tokenData = await tokenResponse.json() as { access_token: string; expires_in?: number }
  cachedAccessToken = {
    token: tokenData.access_token,
    expiresAt: nowMs + Math.max(300, tokenData.expires_in || 3600) * 1000,
  }
  return tokenData.access_token
}

function preview(value: string | null | undefined, max = 150) {
  const clean = (value || '').replace(/\s+/g, ' ').trim()
  if (!clean) return 'You have a new Aroma Ceylon message.'
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const firebaseSecret = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') || ''
    const authHeader = req.headers.get('Authorization') || ''

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Supabase function environment is incomplete.' }, 500)
    }
    if (!firebaseSecret) {
      return jsonResponse({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON secret is not configured.' }, 503)
    }
    if (!authHeader) return jsonResponse({ error: 'Authentication is required.' }, 401)

    const payload = await req.json() as PushRequest
    const threadId = (payload.thread_id || '').trim()
    const event = payload.event
    if (!threadId || !['thread_created', 'thread_reply'].includes(event || '')) {
      return jsonResponse({ error: 'Invalid push request.' }, 400)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: authData, error: authError } = await userClient.auth.getUser()
    const user = authData.user
    if (authError || !user) return jsonResponse({ error: 'Invalid session.' }, 401)

    // Fetch through the caller client first. RLS proves the caller is allowed to
    // participate in this thread.
    const { data: thread, error: threadError } = await userClient
      .from('message_threads')
      .select('id,sender_id,subject,category,audience,confidential,status')
      .eq('id', threadId)
      .single()
    if (threadError || !thread) return jsonResponse({ error: 'Message thread is not accessible.' }, 403)

    const { data: latestMessage, error: latestError } = await userClient
      .from('thread_messages')
      .select('sender_id,body,created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (latestError || !latestMessage) return jsonResponse({ error: 'No message found for this thread.' }, 400)
    if (latestMessage.sender_id !== user.id) {
      return jsonResponse({ error: 'Only the latest message sender can trigger its push.' }, 403)
    }

    const { data: callerProfile } = await serviceClient
      .from('profiles')
      .select('full_name,role')
      .eq('id', user.id)
      .single()

    const { data: recipientRows, error: recipientError } = await serviceClient
      .from('message_recipients')
      .select('recipient_id')
      .eq('thread_id', threadId)
    if (recipientError) throw recipientError

    const participantIds = [...new Set([
      thread.sender_id,
      ...(recipientRows || []).map((row: { recipient_id: string }) => row.recipient_id),
    ])].filter(Boolean)

    // A reply from one employee to a selected/all-employees announcement must
    // go back to the admin sender only; it must never notify the other employees.
    const isBroadcastThread = thread.audience === 'all' || thread.audience === 'selected'
    const targetUserIds = isBroadcastThread && user.id !== thread.sender_id
      ? [thread.sender_id]
      : participantIds.filter((id) => id !== user.id)

    if (!targetUserIds.length) return jsonResponse({ delivered: 0, skipped: 'No recipients.' })

    const { data: devices, error: deviceError } = await serviceClient
      .from('push_devices')
      .select('id,user_id,token')
      .in('user_id', targetUserIds)
      .eq('enabled', true)
    if (deviceError) throw deviceError
    if (!devices?.length) return jsonResponse({ delivered: 0, skipped: 'No registered Android devices.' })

    const account = JSON.parse(firebaseSecret) as FirebaseServiceAccount
    if (!account.project_id || !account.client_email || !account.private_key) {
      throw new Error('Firebase service account secret is invalid.')
    }

    const accessToken = await firebaseAccessToken(account)
    const senderName = callerProfile?.full_name?.trim() || (callerProfile?.role === 'admin' ? 'Aroma Ceylon' : 'Team member')
    const isAnnouncement = thread.category === 'Announcement' || thread.audience === 'all'
    const title = isAnnouncement
      ? 'Aroma Ceylon announcement'
      : callerProfile?.role === 'admin'
        ? 'New message from Aroma Ceylon'
        : `${senderName} sent a message`
    const body = thread.confidential
      ? `Confidential: ${preview(thread.subject, 110)}`
      : preview(latestMessage.body)

    let delivered = 0
    let failed = 0
    const disabledDeviceIds: string[] = []

    for (const device of devices) {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: device.token,
              notification: { title, body },
              data: {
                title,
                body,
                view: 'messages',
                thread_id: threadId,
                event: event || 'thread_reply',
              },
              android: {
                priority: 'high',
                notification: {
                  channel_id: 'aroma_messages',
                  sound: 'default',
                  tag: `thread-${threadId}`,
                },
              },
            },
          }),
        },
      )

      if (response.ok) {
        delivered += 1
        continue
      }

      failed += 1
      const errorText = await response.text()
      if (errorText.includes('UNREGISTERED') || errorText.includes('registration-token-not-registered')) {
        disabledDeviceIds.push(device.id)
      }
      console.error('FCM send failed', response.status, errorText)
    }

    if (disabledDeviceIds.length) {
      await serviceClient
        .from('push_devices')
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .in('id', disabledDeviceIds)
    }

    return jsonResponse({ delivered, failed, recipients: targetUserIds.length })
  } catch (error) {
    console.error(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Push notification failed.' }, 500)
  }
})
