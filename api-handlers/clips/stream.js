import { generateSasUrl, getPublicBlobUrl, BlobNotFoundError, SUPPORTED_CONTAINERS, CONTAINER_NAME, THUMBS_CONTAINER_NAME } from './azure.js'
import { getAuthenticatedUser, supabase } from '../auth.js'
import { areFriends } from '../friendships.js'

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

    const requestedContainer = container || CONTAINER_NAME
    if (requestedContainer !== clip.container) {
      return res.status(403).json({ data: null, error: 'You do not have permission to view this clip' })
    }

    const allowed = await canViewClip(clip, user)
    if (!allowed) {
      return res.status(403).json({ data: null, error: 'You do not have permission to view this clip' })
    }

    const url =
      clip.visibility === 'public'
        ? getPublicBlobUrl(blobName, requestedContainer)
        : await generateSasUrl(blobName, 'r', requestedContainer)
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
    return { ...data[0], container: CONTAINER_NAME }
  }

  const { data: thumbData, error: thumbError } = await supabase
    .from('clips')
    .select('owner_id, visibility')
    .eq('thumbnail_blob_name', blobName)
    .limit(1)

  if (thumbError) {
    throw new Error(`Failed to find clip by thumbnail blob name: ${thumbError.message}`)
  }
  if (thumbData?.length) {
    return { ...thumbData[0], container: THUMBS_CONTAINER_NAME }
  }
  return null
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
    return areFriends(user.id, clip.owner_id)
  }

  return false
}