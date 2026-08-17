const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REDIRECT_URI = 'http://127.0.0.1:51723'

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
      return res.status(response.ok ? 400 : response.status).json({ data: null, error: data.error_description || data.error, ok: false })
    }

    return res.status(200).json({ data, error: null, ok: true })
  } catch (error) {
    return res.status(502).json({ data: null, error: 'Failed to reach Google token endpoint', ok: false })
  }
}