import { supabase, getAuthenticatedUser } from '../auth.js'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REDIRECT_URI = 'http://127.0.0.1:51723'

async function getStoredRefreshToken(userId) {
  const { data, error } = await supabase
    .from('google_accounts')
    .select('refresh_token')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    return null
  }
  return data?.refresh_token || null
}

export default async function handler(req, res) {
  const allowedOrigin = process.env.CORS_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ data: null, error: 'Method not allowed', ok: false })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return res.status(500).json({ data: null, error: 'Missing Google API keys in environment variables', ok: false })
  }

  const body = req.body || {}
  let authenticatedUserId = null
  const params = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: body.grant_type,
  }

  if (body.grant_type === 'authorization_code') {
    if (!body.code || !body.code_verifier) {
      return res.status(400).json({ data: null, error: 'Missing code or code_verifier', ok: false })
    }
    params.redirect_uri = REDIRECT_URI
    params.code = body.code
    params.code_verifier = body.code_verifier
  } else if (body.grant_type === 'refresh_token') {
    if (!body.refresh_token) {
      return res.status(400).json({ data: null, error: 'Missing refresh_token', ok: false })
    }

    // Refreshing requires a signed-in caller whose stored token matches the
    // one being exchanged, so a leaked refresh token is useless on its own.
    const { user, error: authError } = await getAuthenticatedUser(req)
    if (authError) {
      return res.status(401).json({ data: null, error: authError, ok: false })
    }

    const storedToken = await getStoredRefreshToken(user.id)
    if (!storedToken || body.refresh_token !== storedToken) {
      return res.status(403).json({ data: null, error: 'Refresh token does not belong to the authenticated user', ok: false })
    }

    authenticatedUserId = user.id
    params.refresh_token = body.refresh_token
  } else {
    return res.status(400).json({ data: null, error: 'Unsupported grant_type', ok: false })
  }

  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params),
    })

    const data = await response.json()
    if (!response.ok || data.error) {
      // Keep the machine-readable OAuth error code in `error` (clients branch
      // on e.g. invalid_grant) and pass Google's prose separately.
      if (authenticatedUserId && data.error === 'invalid_grant') {
        // The stored credential is dead; remove it so the next link attempt
        // starts a clean OAuth flow instead of retrying a revoked token.
        await supabase.from('google_accounts').delete().eq('user_id', authenticatedUserId)
      }
      return res.status(response.ok ? 400 : response.status).json({
        data: null,
        error: data.error || 'token_request_failed',
        error_description: data.error_description || null,
        ok: false,
      })
    }

    return res.status(200).json({ data, error: null, ok: true })
  } catch (error) {
    return res.status(502).json({ data: null, error: 'Failed to reach Google token endpoint', ok: false })
  }
}