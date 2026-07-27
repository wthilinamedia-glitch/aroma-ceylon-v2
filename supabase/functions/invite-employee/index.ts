import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function readNamedKey(jsonVariable: string, legacyVariable: string) {
  const jsonValue = Deno.env.get(jsonVariable)
  if (jsonValue) {
    try {
      const parsed = JSON.parse(jsonValue)
      if (typeof parsed.default === 'string') return parsed.default
      const firstValue = Object.values(parsed).find((value) => typeof value === 'string')
      if (typeof firstValue === 'string') return firstValue
    } catch {
      // Fall back to the legacy single-value environment variable.
    }
  }
  return Deno.env.get(legacyVariable) || ''
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const publishableKey = readNamedKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
    const secretKey = readNamedKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !publishableKey || !secretKey) {
      return jsonResponse({ error: 'The Edge Function is missing its Supabase environment keys.' }, 500)
    }

    const authorization = request.headers.get('Authorization') || ''
    const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
    if (!accessToken) return jsonResponse({ error: 'You must be signed in.' }, 401)

    const authClient = createClient(supabaseUrl, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
    const adminClient = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })

    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)
    if (userError || !userData.user) return jsonResponse({ error: 'Your session is invalid or expired.' }, 401)

    const { data: callerProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('role, active')
      .eq('id', userData.user.id)
      .single()

    if (profileError || callerProfile?.role !== 'admin' || !callerProfile.active) {
      return jsonResponse({ error: 'Only the active administrator can invite employees.' }, 403)
    }

    const payload = await request.json()
    const fullName = String(payload.full_name || '').trim()
    const email = String(payload.email || '').trim().toLowerCase()
    const phone = payload.phone ? String(payload.phone).trim() : null
    const jobTitle = payload.job_title ? String(payload.job_title).trim() : null
    const salary = Number(payload.monthly_salary || 0)
    const salaryCurrency = payload.salary_currency === 'LKR' ? 'LKR' : 'EUR'

    if (!fullName) return jsonResponse({ error: 'Employee name is required.' }, 400)
    if (!/^\S+@\S+\.\S+$/.test(email)) return jsonResponse({ error: 'Enter a valid employee email address.' }, 400)
    if (!Number.isFinite(salary) || salary < 0) return jsonResponse({ error: 'Monthly salary is invalid.' }, 400)

    const origin = request.headers.get('Origin')
    const options: { data: Record<string, string>; redirectTo?: string } = {
      data: { full_name: fullName },
    }
    if (origin?.startsWith('https://')) options.redirectTo = `${origin}/`

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, options)
    if (inviteError || !inviteData.user) {
      return jsonResponse({ error: inviteError?.message || 'Unable to invite the employee.' }, 400)
    }

    const { error: upsertError } = await adminClient.from('profiles').upsert({
      id: inviteData.user.id,
      full_name: fullName,
      email,
      phone,
      job_title: jobTitle,
      role: 'user',
      active: true,
      monthly_salary: salary,
      salary_currency: salaryCurrency,
    })

    if (upsertError) {
      return jsonResponse({
        error: `The invitation was sent, but the employee profile could not be completed: ${upsertError.message}`,
      }, 500)
    }

    return jsonResponse({
      success: true,
      employee: { id: inviteData.user.id, email, full_name: fullName },
    })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500)
  }
})
