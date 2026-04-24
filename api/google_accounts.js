import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  const allowedOrigin = process.env.CORS_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method === 'GET') {
    if (!req.query?.user_id) {
      return res.status(400).json({ data: null, error: 'Missing user_id in query' })
    }

    const { data, error } = await supabase
      .from('google_accounts')
      .select('refresh_token')
      .eq('user_id', req.query.user_id)
      .single()

    if (error) {
      return res.status(500).json({ data: null, error: error.message })
    }

    return res.status(200).json({ data: data ? data.refresh_token : null, error: null })
  }

  if (req.method === 'POST') {
    if (!req.body || !req.body.user_id || !req.body.token) {
      return res.status(400).json({ data: null, error: 'Missing user_id or token in request body' })
    }

    const { user_id, token } = req.body
    const { data, error } = await supabase
      .from('google_accounts')
      .upsert({ user_id, refresh_token: token }, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) {
      return res.status(500).json({ data: null, error: error.message })
    }

    return res.status(200).json({ data, error: null })
  }

  if (req.method === 'DELETE') {
    const user_id = req.body?.user_id || req.query?.user_id
    if (!user_id) {
      return res.status(400).json({ data: null, error: 'Missing user_id for delete' })
    }

    const { error } = await supabase
      .from('google_accounts')
      .delete()
      .eq('user_id', user_id)

    if (error) {
      return res.status(500).json({ data: null, error: error.message })
    }

    return res.status(200).json({ data: true, error: null })
  }

  return res.status(405).json({ data: null, error: 'Method not allowed' })
}