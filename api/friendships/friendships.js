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

  switch (req.method) {
    case 'GET':
      if (req.query.userId) {
        const userId = req.query.userId
        const { data, error } = await supabase
          .from('friendships')
          .select('*')
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
        
        if (error) return res.status(500).json({ data: null, error: error.message })
        return res.status(200).json({ data, error: null })
      }

      {
        const { data, error } = await supabase
          .from('friendships')
          .select('*')

        if (error) return res.status(500).json({ data: null, error: error.message })
        return res.status(200).json({ data, error: null })
      }

    case 'POST':
      if (!req.body || !req.body.user_id || !req.body.friend_id) {
        return res.status(400).json({ data: null, error: 'Missing user_id or friend_id' })
      }

      if (req.body.user_id === req.body.friend_id) {
        return res.status(400).json({ data: null, error: 'Cannot friend yourself' })
      }

      const { user_id, friend_id } = req.body
      const { data, error } = await supabase
        .from('friendships')
        .insert({
          user_id,
          friend_id,
          status: 'pending'
        })
        .select('*')

      if (error) {
        return res.status(500).json({ data: null, error: error.message })
      }

      return res.status(201).json({ data, error: null })

    case 'DELETE':
      if (!req.body || !req.body.user_id || !req.body.friend_id) {
        return res.status(400).json({ data: null, error: 'Missing user_id or friend_id' })
      }

      if (req.body.user_id === req.body.friend_id) {
        return res.status(400).json({ data: null, error: 'Cannot unfriend yourself' })
      }

      if (req.body.type === 'cancel-request') {
        const { data, error } = await supabase
          .from('friendships')
          .delete()
          .eq('user_id', req.body.user_id)
          .eq('friend_id', req.body.friend_id)
          .eq('status', 'pending')

        if (error) {
          return res.status(500).json({ data: null, error: error.message })
        }

        return res.status(200).json({ data, error: null })
      }

      if (req.body.type === 'decline-request') {
        const { data, error } = await supabase
          .from('friendships')
          .delete()
          .eq('user_id', req.body.friend_id)
          .eq('friend_id', req.body.user_id)
          .eq('status', 'pending')

        if (error) {
          return res.status(500).json({ data: null, error: error.message })
        }

        return res.status(200).json({ data, error: null })
      }

      if (req.body.type === 'remove-friend' || !req.body.type) {
        const { data, error } = await supabase
          .from('friendships')
          .delete()
          .or(`and(user_id.eq.${req.body.user_id},friend_id.eq.${req.body.friend_id}),and(user_id.eq.${req.body.friend_id},friend_id.eq.${req.body.user_id})`)

        if (error) {
          return res.status(500).json({ data: null, error: error.message })
        }

        return res.status(200).json({ data, error: null })
      }

      return res.status(400).json({ data: null, error: 'Invalid delete type' })

    case 'PUT':
      if (!req.body || !req.body.user_id || !req.body.friend_id) {
        return res.status(400).json({ data: null, error: 'Missing user_id or friend_id' })
      }
      if (req.body.user_id === req.body.friend_id) {
        return res.status(400).json({ data: null, error: 'Cannot accept friendship with yourself' })
      }

      if (req.body && req.body.friend_id && req.body.user_id) {
        const { data, error } = await supabase
          .from('friendships')
          .update({ status: 'accepted' })
          .eq('friend_id', req.body.user_id)
          .eq('user_id', req.body.friend_id)
          .eq('status', 'pending')

        if (error) {
          return res.status(500).json({ data: null, error: error.message })
        }

        return res.status(200).json({ data, error: null })
      }

      return res.status(400).json({ data: null, error: 'Invalid put payload' })

    default:
      return res.status(405).json({ data: null, error: 'Method not allowed' })
  }
}