import { supabase, getAuthenticatedUser } from '../auth.js'

export default async function handler(req, res) {
  const allowedOrigin = process.env.CORS_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  const { user, error: authError } = await getAuthenticatedUser(req)
  if (authError) {
    return res.status(401).json({ data: null, error: authError })
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('google_accounts')
      .select('refresh_token')
      .eq('user_id', user.id)
      .single()

    if (error) {
      return res.status(500).json({ data: null, error: error.message })
    }

    return res.status(200).json({ data: data ? data.refresh_token : null, error: null })
  }

  if (req.method === 'POST') {
    if (!req.body || !req.body.token) {
      return res.status(400).json({ data: null, error: 'Missing token in request body' })
    }

    const { data, error } = await supabase
      .from('google_accounts')
      .upsert({ user_id: user.id, refresh_token: req.body.token }, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) {
      return res.status(500).json({ data: null, error: error.message })
    }

    return res.status(200).json({ data, error: null })
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase
      .from('google_accounts')
      .delete()
      .eq('user_id', user.id)

    if (error) {
      return res.status(500).json({ data: null, error: error.message })
    }

    return res.status(200).json({ data: true, error: null })
  }

  return res.status(405).json({ data: null, error: 'Method not allowed' })
}