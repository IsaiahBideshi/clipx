import { supabase, getAuthenticatedUser } from '../auth.js'
import { generateSasUrl, BlobNotFoundError, SUPPORTED_CONTAINERS, CONTAINER_NAME } from './azure.js'

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
      
      if (req.query.userId) {
        const { data, error } = await supabase
          .from('clips')
          .select('*')
          .eq('owner_id', req.query.userId)
          .order('created_at', { ascending: false })
        if (error) {
          console.error('Error fetching user clips:', error)
          return res.status(500).json({ data: null, error: error.message })
        }

        return res.status(200).json({ data, error: null })
      }
      
      return res.status(400).json({ data: null, error: 'Invalid visibility parameter' })

    case 'POST': {
      const { user, error: authError } = await getAuthenticatedUser(req)
      if (authError) {
        return res.status(401).json({ data: null, error: authError })
      }

      const { name, contentType, container = CONTAINER_NAME } = req.body || {}
      if (!name || !contentType) {
        return res.status(400).json({ data: null, error: 'Missing "name" or "contentType" in request body' })
      }
      if (!SUPPORTED_CONTAINERS.includes(container)) {
        return res.status(400).json({ data: null, error: `Unsupported container "${container}"` })
      }

      try {
        const canWrite = await canWriteBlob(name, user)
        if (!canWrite) {
          return res.status(403).json({ data: null, error: 'You do not have permission to write to this blob' })
        }
        
        const url = await generateSasUrl(name, 'w', container)
        return res.status(200).json({ data: { url, name }, error: null })
      } catch (err) {
        console.error('Error generating upload URL:', err)
        return res.status(500).json({ data: null, error: 'Failed to generate upload URL' })
      }
    }

    case 'DELETE':

    case 'PUT':

    default:
      return res.status(405).json({ data: null, error: 'Method not allowed' })
  }
}

async function findClipByBlob(blobName) {
  const { data, error } = await supabase
    .from('clips')
    .select('owner_id')
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
    .select('owner_id')
    .eq('thumbnail_blob_name', blobName)
    .limit(1)

  if (thumbError) {
    throw new Error(`Failed to find clip by thumbnail blob name: ${thumbError.message}`)
  }
  return thumbData?.length ? thumbData[0] : null
}

async function canWriteBlob(blobName, user) {
  const clip = await findClipByBlob(blobName)
  if (clip) {
    return clip.owner_id === user.id
  }
  return blobName.startsWith(`${user.id}/`)
}