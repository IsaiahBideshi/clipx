import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

const AVATAR_BUCKET = process.env.SUPABASE_AVATAR_BUCKET || 'Avatars'
const MAX_AVATAR_FILE_BYTES = 1500 * 1024
const AVATAR_MIME_TO_EXTENSION = {
  'image/png': 'png',
  'image/jpg': 'jpg',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

function setCorsHeaders(res) {
  const allowedOrigin = process.env.CORS_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function getBearerToken(req) {
  const authorization = req.headers.authorization || ''
  const [scheme, token] = authorization.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null
  }
  return token
}

function getProviders(user) {
  return user?.app_metadata?.providers || []
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function parseAvatarDataUrl(value) {
  const match = String(value || '').match(/^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/)
  if (!match) {
    return { data: null, error: 'Avatar must be a PNG, JPG, or WebP image.' }
  }

  const mimeType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1]
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length || buffer.length > MAX_AVATAR_FILE_BYTES) {
    return { data: null, error: 'Avatar must be 1500 KB or smaller.' }
  }

  return { data: { buffer, mimeType, extension: AVATAR_MIME_TO_EXTENSION[mimeType] }, error: null }
}

function isStoredAvatarUrl(value, metadata) {
  return Boolean(value && metadata.avatar_url && value === metadata.avatar_url)
}

function isProviderAvatarUrl(value, metadata) {
  return Boolean(value && !metadata.avatar_url && metadata.picture && value === metadata.picture)
}

async function getAuthenticatedUser(req) {
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

async function getPublicProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('username')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

async function buildAccountPayload(user) {
  const publicProfile = await getPublicProfile(user.id)
  const providers = getProviders(user)
  const metadata = user.user_metadata || {}

  return {
    id: user.id,
    username: publicProfile?.username || metadata.displayName || metadata.name || 'User',
    email: user.email || '',
    emailConfirmed: Boolean(user.email_confirmed_at),
    avatarUrl: metadata.avatar_url || metadata.picture || '',
    hasCustomAvatar: Boolean(metadata.avatar_url),
    avatarPath: metadata.avatar_path || '',
    providers,
    hasPassword: providers.includes('email'),
  }
}

async function removeStoredAvatar(metadata) {
  if (!metadata.avatar_path) {
    return
  }

  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .remove([metadata.avatar_path])

  if (error) {
    console.warn('Failed to remove old avatar:', error.message)
  }
}

async function uploadAvatar(userId, avatarUrl, previousMetadata) {
  const parsed = parseAvatarDataUrl(avatarUrl)
  if (parsed.error) {
    return { data: null, error: parsed.error }
  }

  const { buffer, mimeType, extension } = parsed.data
  const avatarPath = `${userId}/avatar-${Date.now()}.${extension}`

  if (previousMetadata.avatar_path && previousMetadata.avatar_path !== avatarPath) {
    await removeStoredAvatar(previousMetadata)
  }

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(avatarPath, buffer, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: true,
    })

  if (uploadError) {
    return { data: null, error: uploadError.message }
  }

  const { data } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(avatarPath)

  return { data: { avatarPath, avatarUrl: data.publicUrl }, error: null }
}

async function updateProfile(user, body) {
  const username = String(body.username || '').trim()
  const avatarWasSubmitted = Object.prototype.hasOwnProperty.call(body, 'avatarUrl')
  const avatarUrl = avatarWasSubmitted ? String(body.avatarUrl || '').trim() : undefined

  if (username.length < 2 || username.length > 32) {
    return { status: 400, payload: { data: null, error: 'Username must be 2-32 characters.' } }
  }

  const { error: profileError } = await supabase
    .from('users')
    .upsert({ id: user.id, username }, { onConflict: 'id' })

  if (profileError) {
    return { status: 500, payload: { data: null, error: profileError.message } }
  }

  const nextMetadata = {
    ...(user.user_metadata || {}),
    displayName: username,
  }

  if (avatarWasSubmitted) {
    if (!avatarUrl) {
      await removeStoredAvatar(user.user_metadata || {})
      delete nextMetadata.avatar_url
      delete nextMetadata.avatar_path
    } else if (isStoredAvatarUrl(avatarUrl, user.user_metadata || {}) || isProviderAvatarUrl(avatarUrl, user.user_metadata || {})) {
      // Existing custom/provider avatar is unchanged; keep metadata as-is.
    } else {
      const uploadedAvatar = await uploadAvatar(user.id, avatarUrl, user.user_metadata || {})
      if (uploadedAvatar.error) {
        return { status: 400, payload: { data: null, error: uploadedAvatar.error } }
      }

      nextMetadata.avatar_url = uploadedAvatar.data.avatarUrl
      nextMetadata.avatar_path = uploadedAvatar.data.avatarPath
    }
  }

  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: nextMetadata,
  })

  if (error) {
    return { status: 500, payload: { data: null, error: error.message } }
  }

  return { status: 200, payload: { data: await buildAccountPayload(data.user), error: null } }
}

async function updateEmail(user, body) {
  const email = String(body.email || '').trim().toLowerCase()

  if (!isValidEmail(email)) {
    return { status: 400, payload: { data: null, error: 'Enter a valid email address.' } }
  }

  if (email === user.email) {
    return { status: 400, payload: { data: null, error: 'That email is already on this account.' } }
  }

  const { data, error } = await supabase.auth.admin.updateUserById(user.id, { email })

  if (error) {
    return { status: 500, payload: { data: null, error: error.message } }
  }

  return { status: 200, payload: { data: await buildAccountPayload(data.user), error: null } }
}

async function verifyCurrentPassword(user, currentPassword) {
  if (!getProviders(user).includes('email')) {
    return { ok: true, error: null }
  }

  if (!currentPassword) {
    return { ok: false, error: 'Current password is required.' }
  }

  const verifier = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { error } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })

  if (error) {
    return { ok: false, error: 'Current password is incorrect.' }
  }

  return { ok: true, error: null }
}

async function updatePassword(user, body) {
  const password = String(body.password || '')
  const currentPassword = String(body.currentPassword || '')

  if (password.length < 6) {
    return { status: 400, payload: { data: null, error: 'Password must be at least 6 characters.' } }
  }

  const verification = await verifyCurrentPassword(user, currentPassword)
  if (!verification.ok) {
    return { status: 401, payload: { data: null, error: verification.error } }
  }

  const { data, error } = await supabase.auth.admin.updateUserById(user.id, { password })

  if (error) {
    return { status: 500, payload: { data: null, error: error.message } }
  }

  return { status: 200, payload: { data: await buildAccountPayload(data.user), error: null } }
}

export default async function handler(req, res) {
  setCorsHeaders(res)

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  const { user, error: authError } = await getAuthenticatedUser(req)
  if (authError) {
    return res.status(401).json({ data: null, error: authError })
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ data: await buildAccountPayload(user), error: null })
    }

    if (req.method === 'PATCH') {
      const action = String(req.body?.action || '').trim()

      if (action === 'profile') {
        const result = await updateProfile(user, req.body || {})
        return res.status(result.status).json(result.payload)
      }

      if (action === 'email') {
        const result = await updateEmail(user, req.body || {})
        return res.status(result.status).json(result.payload)
      }

      if (action === 'password') {
        const result = await updatePassword(user, req.body || {})
        return res.status(result.status).json(result.payload)
      }

      return res.status(400).json({ data: null, error: 'Invalid account action.' })
    }

    return res.status(405).json({ data: null, error: 'Method not allowed' })
  } catch (error) {
    console.error('Account API error:', error)
    return res.status(500).json({ data: null, error: 'Failed to update account.' })
  }
}
