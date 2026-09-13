import { supabase, getAuthenticatedUser } from '../auth.js'
import { extractAvatarBlobName, uploadAvatarBlob, deleteAvatarBlob } from './azure.js'

const AVATAR_BUCKET = process.env.SUPABASE_AVATAR_BUCKET || 'Avatars'
const MAX_AVATAR_FILE_BYTES = 1500 * 1024
const PROVIDER_AVATAR_SYNC_WINDOW_MS = 5 * 60 * 1000
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
  return Boolean(value && metadata.picture && value === metadata.picture)
}

function sanitizeProviderUsername(value) {
  const username = String(value || '').trim()
  if (username.length < 2) return 'User'
  if (username.length > 32) return username.slice(0, 32)
  return username
}

async function getPublicProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('username, avatar_url')
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
  const avatarUrl = publicProfile?.avatar_url || metadata.avatar_url || metadata.picture || ''

  return {
    id: user.id,
    username: publicProfile?.username || sanitizeProviderUsername(metadata.displayName || metadata.name || 'User'),
    email: user.email || '',
    emailConfirmed: Boolean(user.email_confirmed_at),
    avatarUrl,
    hasCustomAvatar: Boolean(avatarUrl) && !isProviderAvatarUrl(avatarUrl, metadata),
    avatarPath: metadata.avatar_path || '',
    providers,
    hasPassword: providers.includes('email'),
  }
}

async function removeStoredAvatar(metadata, currentAvatarUrl) {
  const customBlobName = extractAvatarBlobName(currentAvatarUrl)
  if (customBlobName) {
    try {
      await deleteAvatarBlob(customBlobName)
    } catch (error) {
      console.warn('Failed to remove old avatar:', error.message)
    }
  }

  if (metadata.avatar_path) {
    const { error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .remove([metadata.avatar_path])

    if (error) {
      console.warn('Failed to remove legacy avatar:', error.message)
    }
  }
}

async function uploadAvatar(userId, avatarUrl) {
  const parsed = parseAvatarDataUrl(avatarUrl)
  if (parsed.error) {
    return { data: null, error: parsed.error }
  }

  const { buffer, mimeType, extension } = parsed.data
  const blobName = `${userId}/avatar-${Date.now()}.${extension}`

  try {
    const publicUrl = await uploadAvatarBlob({ blobName, buffer, contentType: mimeType })
    return { data: { avatarUrl: publicUrl, blobName }, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

async function updateProfile(user, body) {
  const username = String(body.username || '').trim()
  const avatarWasSubmitted = Object.prototype.hasOwnProperty.call(body, 'avatarUrl')
  const avatarUrl = avatarWasSubmitted ? String(body.avatarUrl || '').trim() : undefined

  if (username.length < 2 || username.length > 32) {
    return { status: 400, payload: { data: null, error: 'Username must be 2-32 characters.' } }
  }

  const metadata = user.user_metadata || {}
  const publicProfile = await getPublicProfile(user.id)
  const currentAvatarUrl = publicProfile?.avatar_url || ''


  let avatarUrlToStore
  let removePreviousAvatar = false
  let uploadedBlobName = null
  const nextMetadata = {
    ...metadata,
    displayName: username,
  }

  if (avatarWasSubmitted) {
    if (!avatarUrl) {
      delete nextMetadata.avatar_url
      delete nextMetadata.avatar_path
      avatarUrlToStore = ''
      removePreviousAvatar = Boolean(currentAvatarUrl) || Boolean(metadata.avatar_path)
    } else if (avatarUrl === currentAvatarUrl) {
      avatarUrlToStore = avatarUrl
    } else if (isStoredAvatarUrl(avatarUrl, metadata) || isProviderAvatarUrl(avatarUrl, metadata)) {
      avatarUrlToStore = undefined
    } else {
      const uploadedAvatar = await uploadAvatar(user.id, avatarUrl)
      if (uploadedAvatar.error) {
        return { status: 400, payload: { data: null, error: uploadedAvatar.error } }
      }

      avatarUrlToStore = uploadedAvatar.data.avatarUrl
      uploadedBlobName = uploadedAvatar.data.blobName
    }
  }

  const profileRow = { id: user.id, username }
  if (avatarWasSubmitted && avatarUrlToStore !== undefined) {
    profileRow.avatar_url = avatarUrlToStore
  }

  const { error: profileError } = await supabase
    .from('users')
    .upsert(profileRow, { onConflict: 'id' })

  if (profileError) {
    if (uploadedBlobName) {
      await deleteAvatarBlob(uploadedBlobName).catch((cleanupError) => {
        console.warn('Failed to clean up orphaned avatar:', cleanupError.message)
      })
    }
    return { status: 500, payload: { data: null, error: profileError.message } }
  }

  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: nextMetadata,
  })

  if (error) {
    return { status: 500, payload: { data: null, error: error.message } }
  }

  if (uploadedBlobName || removePreviousAvatar) {
    await removeStoredAvatar(metadata, currentAvatarUrl)
  }

  return { status: 200, payload: { data: await buildAccountPayload(data.user), error: null } }
}

async function updateProviderAvatar(user, body) {
  const avatarUrl = String(body.avatarUrl || '').trim()
  const metadata = user.user_metadata || {}

  if (!avatarUrl || avatarUrl !== metadata.picture) {
    return { status: 400, payload: { data: null, error: 'Invalid provider avatar.' } }
  }

  const publicProfile = await getPublicProfile(user.id)

  if (publicProfile?.avatar_url) {
    return { status: 200, payload: { data: null, error: null } }
  }

  const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0
  if (Date.now() - createdAt > PROVIDER_AVATAR_SYNC_WINDOW_MS) {
    return { status: 200, payload: { data: null, error: null } }
  }

  const profileRow = { id: user.id, avatar_url: avatarUrl }
  if (!publicProfile?.username) {
    profileRow.username = sanitizeProviderUsername(metadata.displayName || metadata.name || 'User')
  }

  const { error: profileError } = await supabase
    .from('users')
    .upsert(profileRow, { onConflict: 'id' })

  if (profileError) {
    return { status: 500, payload: { data: null, error: profileError.message } }
  }

  return { status: 200, payload: { data: await buildAccountPayload(user), error: null } }
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

  const { error } = await supabase.auth.signInWithPassword({
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

      if (action === 'provider-avatar') {
        const result = await updateProviderAvatar(user, req.body || {})
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
