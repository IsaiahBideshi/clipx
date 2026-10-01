import { supabase } from '../auth.js'
import { getStreamUrl, BlobNotFoundError, containerClient } from './azure.js'
import { extractAvatarBlobName } from '../account/azure.js'

const CLIP_PATH = /^\/clip\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/video)?$/i
const PLAYER_ASSETS = `
    <link rel="stylesheet" href="/clip-player/player.css" />
    <script type="module" src="/clip-player/player.js"></script>`

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ data: null, error: 'Method not allowed' })
  }

  const [, clipId, video] = req.url.split('?')[0].match(CLIP_PATH) || []

  if (video) {
    try {
      const clip = await findPublicClip(clipId)
      if (!clip) {
        return res.status(404).json({ data: null, error: 'Clip not found' })
      }
      return res.redirect(302, await getStreamUrl(clip.blob_name))
    } catch (err) {
      console.error('Error generating shared clip stream URL:', err)
      if (err instanceof BlobNotFoundError) {
        return res.status(404).json({ data: null, error: 'Clip not found' })
      }
      return res.status(500).json({ data: null, error: 'Failed to generate stream URL' })
    }
  }

  try {
    const clip = clipId ? await findPublicClip(clipId) : null
    if (!clip || !(await containerClient.getBlobClient(clip.blob_name).exists())) {
      return sendPage(res, 404, 'Clip unavailable', renderUnavailable())
    }

    const { data: owner, error: ownerError } = await supabase
      .from('users')
      .select('username, avatar_url')
      .eq('id', clip.owner_id)
      .maybeSingle()
    if (ownerError) {
      console.error('Error fetching shared clip owner:', ownerError)
    }

    return sendPage(res, 200, clip.title || 'Untitled clip', renderClip(clip, owner), PLAYER_ASSETS)
  } catch (err) {
    console.error('Error loading shared clip:', err)
    return sendPage(res, 500, 'Clip unavailable', renderUnavailable())
  }
}

async function findPublicClip(clipId) {
  const { data, error } = await supabase
    .from('clips')
    .select('id, title, blob_name, owner_id, created_at')
    .eq('id', clipId)
    .eq('visibility', 'public')
    .neq('blob_name', '')
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to find shared clip: ${error.message}`)
  }
  return data
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

function isTrustedAvatar(url) {
  try {
    return new URL(url).hostname === 'lh3.googleusercontent.com' || Boolean(extractAvatarBlobName(url))
  } catch {
    return false
  }
}

function renderClip(clip, owner) {
  const username = owner?.username || 'ClipX user'
  const avatar = isTrustedAvatar(owner?.avatar_url)
    ? `<img class="clip-owner-avatar" src="${escapeHtml(owner.avatar_url)}" alt="" />`
    : `<span class="clip-owner-avatar">${escapeHtml([...username][0].toUpperCase())}</span>`
  const uploadedAt = new Date(clip.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return `
      <div id="clip-player" class="video-player-container" data-src="/clip/${clip.id}/video"></div>
      <div class="video-metadata">
        <h1 class="video-title">${escapeHtml(clip.title || 'Untitled clip')}</h1>
        <div class="clip-owner">
          ${avatar}
          <span class="clip-owner-name">${escapeHtml(username)}</span>
          <span>·</span>
          <span>${uploadedAt}</span>
        </div>
      </div>`
}

function renderUnavailable() {
  return `
      <div class="clip-missing">
        <p class="eyebrow">Clip unavailable</p>
        <h1 class="video-title">We couldn't load this clip.</h1>
        <p class="card-copy">It may be private, friends-only, or deleted.</p>
        <a class="clip-button" href="/">Go to ClipX</a>
      </div>`
}

function sendPage(res, status, title, content, head = '') {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.status(status).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${escapeHtml(title)} - ClipX</title>
    <link rel="icon" type="image/svg+xml" href="/assets/clipx_icon.svg" />
    <link rel="stylesheet" href="/landing/clip.css" />${head}
  </head>
  <body>
    <header class="clip-nav">
      <a class="clip-nav-name" href="/">ClipX</a>
    </header>
    <main class="clip-page">${content}
    </main>
  </body>
</html>`)
}
