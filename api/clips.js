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
      if (req.query.visibility === 'public') {
        const { data, error } = await supabase
          .from('clips')
          .select('*')
          .neq('visibility', 'private')
          .order('created_at', { ascending: false })
        if (error) {
          console.error('Error fetching public clips:', error)
          return res.status(500).json({ data: null, error: error.message })
        }

        return res.status(200).json({ data, error: null })
      }
      else if (req.query.visibility === 'private') {
        const { data, error } = await supabase
          .from('clips')
          .select('*')
          .eq('visibility', 'private')
          .order('created_at', { ascending: false })
        if (error) {
          console.error('Error fetching private clips:', error)
          return res.status(500).json({ data: null, error: error.message })
        }

        return res.status(200).json({ data, error: null })
      }
      
      return res.status(400).json({ data: null, error: 'Invalid visibility parameter' })

    case 'POST':

    case 'DELETE':

    case 'PUT':

    default:
      return res.status(405).json({ data: null, error: 'Method not allowed' })
  }
}