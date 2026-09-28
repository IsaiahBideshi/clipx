import { getAuthenticatedUser } from './auth.js'

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

  const { error: authError } = await getAuthenticatedUser(req)
  if (authError) {
    return res.status(401).json({ data: null, error: authError })
  }

  try {
    if (req.query.id !== undefined) {
      const id = Number(req.query.id)
      if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({ data: null, error: 'Invalid "id" query parameter' })
      }

      const games = await queryGames(`
        fields name, cover.image_id, first_release_date;
        where id = ${id} & game_type = 0;
        limit 1;
      `)
      return res.status(200).json({ data: games[0] ?? null, error: null })
    }

    const search = String(req.query.search || '').replace(/["\\]/g, '').trim()
    if (!search || search.length > 100) {
      return res.status(400).json({ data: null, error: 'Missing or invalid "search" query parameter' })
    }

    const games = await queryGames(`
      fields name, cover.url, cover.image_id, total_rating_count, first_release_date;
      search "${search}";
      where game_type = 0;
      limit 5;
    `)
    games.sort((a, b) => (b.total_rating_count || 0) - (a.total_rating_count || 0))
    return res.status(200).json({ data: games, error: null })
  } catch (err) {
    console.error('Error querying IGDB:', err)
    return res.status(500).json({ data: null, error: 'Failed to load game data' })
  }
}

async function queryGames(body) {
  const response = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: {
      'Client-ID': process.env.IGDB_CLIENT_ID,
      Authorization: `Bearer ${process.env.IGDB_ACCESS_TOKEN}`,
      'Content-Type': 'text/plain',
      Accept: 'application/json',
    },
    body,
  })
  if (!response.ok) {
    throw new Error(`IGDB request failed (${response.status}): ${await response.text()}`)
  }
  return response.json()
}
