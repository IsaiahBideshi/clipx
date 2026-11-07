import { supabase, getAuthenticatedUser } from './auth.js'
import { queryIgdb } from './igdb.js'

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
    if (req.query.uploaded !== undefined) {
      const { data: clips, error } = await supabase
        .from('clips')
        .select('game_id')
        .eq('owner_id', user.id)
        .not('game_id', 'is', null)
        .order('created_at', { ascending: false })
      if (error) {
        console.error('Error fetching uploaded game ids:', error)
        return res.status(500).json({ data: null, error: error.message })
      }

      const ids = [...new Set(clips.map((clip) => Number(clip.game_id)))]
        .filter((id) => Number.isSafeInteger(id) && id > 0)
        .slice(0, 500)
      if (ids.length === 0) {
        return res.status(200).json({ data: [], error: null })
      }

      const games = await queryGames(`
        fields name, cover.url, first_release_date;
        where id = (${ids.join(',')});
        limit 500;
      `)
      const order = new Map(ids.map((id, index) => [id, index]))
      games.sort((a, b) => order.get(a.id) - order.get(b.id))
      return res.status(200).json({ data: games, error: null })
    }

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

    if (req.query.steam !== undefined) {
      const steamAppId = String(req.query.steam)
      if (!/^\d{1,10}$/.test(steamAppId)) {
        return res.status(400).json({ data: null, error: 'Invalid "steam" query parameter' })
      }

      const [externalGame] = await queryIgdb('external_games', `
        fields game;
        where external_game_source = 1 & uid = "${steamAppId}";
        limit 1;
      `)
      if (!externalGame?.game) {
        return res.status(200).json({ data: null, error: null })
      }

      const games = await queryGames(`
        fields name, cover.image_id, first_release_date;
        where id = ${Number(externalGame.game)};
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

function queryGames(body) {
  return queryIgdb('games', body)
}
