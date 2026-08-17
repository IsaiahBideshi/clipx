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
        const { data: friendships, error: friendshipsError } = await supabase
          .from('friendships')
          .select('*')
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`)

        if (friendshipsError) return res.status(500).json({ data: null, error: friendshipsError.message })

        const friendIds = friendships.map(f => f.user_id === userId ? f.friend_id : f.user_id)
        const { data: friends, error: friendsError } = await supabase
          .from('users')
          .select('*')
          .in('id', friendIds)


        if (friendsError) return res.status(500).json({ data: null, error: friendsError.message })

        return res.status(200).json({ data: friends, error: null })
      }
    
      


    default:
      const { data, error } = await supabase
        .from('users')
        .select('*')

      if (error) return res.status(500).json({ data: null, error: error.message })
      return res.status(200).json({ data, error: null })
  }
}