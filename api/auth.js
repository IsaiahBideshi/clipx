import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

export function getBearerToken(req) {
  const authorization = req.headers.authorization || ''
  const [scheme, token] = authorization.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null
  }
  return token
}

export async function getAuthenticatedUser(req) {
  const token = getBearerToken(req)
  if (!token) {
    return { user: null, error: 'Missing authorization token' }
  }

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) {
    return { user: null, error: 'Invalid or expired session' }
  }

  return { user: data.user, error: null }
}
