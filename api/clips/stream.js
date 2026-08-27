import { generateSasUrl } from './azure.js'

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

  const blobName = req.query.name
  if (!blobName) {
    return res.status(400).json({ data: null, error: 'Missing "name" query parameter' })
  }

  try {
    const url = generateSasUrl(blobName, 'r')
    return res.status(200).json({ data: { url }, error: null })
  } catch (err) {
    console.error('Error generating stream URL:', err)
    return res.status(500).json({ data: null, error: 'Failed to generate stream URL' })
  }
}
