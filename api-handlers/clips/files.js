import { containerClient } from './azure.js'
import { getAuthenticatedUser } from '../auth.js'

export default async function handler(req, res) {
  const allowedOrigin = process.env.CORS_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ data: null, error: 'Method not allowed' })
  }

  const { user, error: authError } = await getAuthenticatedUser(req)
  if (authError) {
    return res.status(401).json({ data: null, error: authError })
  }

  try {
    const blobs = []
    for await (const blob of containerClient.listBlobsFlat()) {
      blobs.push({
        name: blob.name,
        lastModified: blob.properties.lastModified,
        contentLength: blob.properties.contentLength,
        contentType: blob.properties.contentType,
      })
    }

    return res.status(200).json({ data: blobs, error: null })
  } catch (err) {
    console.error('Error listing blobs:', err)
    return res.status(500).json({ data: null, error: 'Failed to list blobs' })
  }
}
