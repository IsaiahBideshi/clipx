import { generateSasUrl, getPublicBlobUrl, BlobNotFoundError, SUPPORTED_CONTAINERS } from './azure.js'
import { getAuthenticatedUser, supabase } from '../auth.js'

export default async function handler(req, res) {
  const allowedOrigin = process.env.CORS_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  const { user, error: authError } = await getAuthenticatedUser(req)
  if (authError) {
    return res.status(401).json({ data: null, error: authError })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ data: null, error: 'Method not allowed' })
  }

  const blobName = req.query.name
  if (!blobName) {
    return res.status(400).json({ data: null, error: 'Missing "name" query parameter' })
  }

  const container = req.query.container
  if (container && !SUPPORTED_CONTAINERS.includes(container)) {
    return res.status(400).json({ data: null, error: `Unsupported container "${container}"` })
  }

  try {
    const clip = await findClipByBlob(blobName)
    if (!clip) {
      return res.status(404).json({ data: null, error: 'Clip not found' })
    }

    const allowed = await canViewClip(clip, user)
    if (!allowed) {
      return res.status(403).json({ data: null, error: 'You do not have permission to view this clip' })
    }

    const url =
      clip.visibility === 'public'
        ? getPublicBlobUrl(blobName, container)
        : await generateSasUrl(blobName, 'r', container)
    return res.status(200).json({ data: { url }, error: null })
  } catch (err) {
    console.error('Error generating stream URL:', err)
    if (err instanceof BlobNotFoundError) {
      return res.status(err.statusCode).json({ data: null, error: err.message })
    }
    return res.status(500).json({ data: null, error: 'Failed to generate stream URL' })
  }
}

async function findClipByBlob(blobName) {
  const { data, error } = await supabase
    .from('clips')
    .select('owner_id, visibility')
    .eq('blob_name', blobName)
    .limit(1)

  if (error) {
    throw new Error(`Failed to find clip by blob name: ${error.message}`)
  }
  if (data?.length) {
    return data[0]
  }

  const { data: thumbData, error: thumbError } = await supabase
    .from('clips')
    .select('owner_id, visibility')
    .eq('thumbnail_blob_name', blobName)
    .limit(1)

  if (thumbError) {
    throw new Error(`Failed to find clip by thumbnail blob name: ${thumbError.message}`)
  }
  return thumbData?.length ? thumbData[0] : null
}

async function canViewClip(clip, user) {
  if (clip.visibility === 'public') {
    return true
  }
  if (clip.owner_id === user.id) {
    return true
  }
  if (clip.visibility === 'private') {
    return false
  }

  if (clip.visibility === 'friends') {
    const { data, error } = await supabase
      .from('friendships')
      .select('id')
      .eq('status', 'accepted')
      .or(`and(user_id.eq.${user.id},friend_id.eq.${clip.owner_id}),and(user_id.eq.${clip.owner_id},friend_id.eq.${user.id})`)
      .limit(1)

    if (error) {
      throw new Error(`Failed to check friendship: ${error.message}`)
    }
    return Boolean(data?.length)
  }

  return false
}