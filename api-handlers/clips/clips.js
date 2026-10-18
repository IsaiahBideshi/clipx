import { supabase, getAuthenticatedUser } from '../auth.js'
import { generateSasUrl, deleteBlob, getStreamBlobName, BlobNotFoundError, SUPPORTED_CONTAINERS, CONTAINER_NAME, THUMBS_CONTAINER_NAME } from './azure.js'
import { areFriends } from '../friendships.js'
import { parseClipDetails } from './clipDetails.js'

export default async function handler(req, res) {
  const allowedOrigin = process.env.CORS_ORIGIN || '*'
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  switch (req.method) {
    case 'GET': {
      if (req.query.visibility === 'public') {
        const { data, error } = await supabase
          .from('clips')
          .select('*')
          .eq('visibility', 'public')
          .order('created_at', { ascending: false })
        if (error) {
          console.error('Error fetching public clips:', error)
          return res.status(500).json({ data: null, error: error.message })
        }

        return res.status(200).json({ data, error: null })
      }

      const { user, error: authError } = await getAuthenticatedUser(req)
      if (authError) {
        return res.status(401).json({ data: null, error: authError })
      }

      if (req.query.scope === 'library') {
        const limit = Math.max(1, Math.min(parseInt(req.query.limit) || 50, 100))
        const offset = Math.max(0, parseInt(req.query.offset) || 0)

        const { data: friendRows, error: friendsError } = await supabase
          .from('friendships')
          .select('user_id, friend_id')
          .eq('status', 'accepted')
          .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
        if (friendsError) {
          console.error('Error fetching friend ids:', friendsError)
          return res.status(500).json({ data: null, error: friendsError.message })
        }

        const friendIds = Array.from(
          new Set(
            (friendRows || []).map((row) =>
              row.user_id === user.id ? row.friend_id : row.user_id
            )
          )
        )

        const visibilityFilter = friendIds.length > 0
          ? `or(visibility.eq.public,owner_id.eq.${user.id},and(visibility.eq.friends,owner_id.in.(${friendIds.join(',')})))`
          : `or(visibility.eq.public,owner_id.eq.${user.id})`

        let query = supabase
          .from('clips')
          .select('*', { count: 'exact' })
          .or(visibilityFilter)

        const rawTitle = String(req.query.title || '').trim()
        if (rawTitle) {
          const escaped = rawTitle.replace(/[\\%_]/g, (match) => `\\${match}`)
          query = query.ilike('title', `%${escaped}%`)
        }

        if (req.query.gameId) {
          query = query.eq('game_id', req.query.gameId)
        }

        if (req.query.ownerId) {
          query = query.eq('owner_id', req.query.ownerId)
        }

        const tagIds = String(req.query.tagIds || '')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
        const tagLabels = parseTagLabels(req.query.tagLabels)
        if (tagLabels.length > 20) {
          return res.status(400).json({ data: null, error: 'You can search at most 20 tags' })
        }
        if (tagIds.length > 0 || tagLabels.length > 0) {
          const tagQueries = tagLabels.map((label) =>
            supabase
              .from('clip_tags')
              .select('clip_id')
              .ilike('label', label.replace(/[\\%_]/g, (match) => `\\${match}`))
          )
          if (tagIds.length > 0) {
            tagQueries.push(supabase.from('clip_tags').select('clip_id').in('user_id', tagIds))
          }
          const tagResults = await Promise.all(tagQueries)
          const tagError = tagResults.find((result) => result.error)?.error
          if (tagError) {
            console.error('Error fetching tagged clip ids:', tagError)
            return res.status(500).json({ data: null, error: tagError.message })
          }
          const taggedClips = tagResults.flatMap((result) => result.data || [])
          const clipIds = Array.from(new Set(taggedClips.map((t) => t.clip_id).filter(Boolean)))
          if (clipIds.length === 0) {
            return res.status(200).json({ data: [], error: null, count: 0 })
          }
          query = query.in('id', clipIds)
        }

        const { data, error, count } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1)

        if (error) {
          console.error('Error fetching library feed:', error)
          return res.status(500).json({ data: null, error: error.message })
        }

        return res.status(200).json({ data, error: null, count: count ?? 0 })
      }

      if (req.query.visibility === 'friends') {
        const friendId = req.query.friendId
        if (!friendId) {
          return res.status(400).json({ data: null, error: 'Missing "friendId" query parameter' })
        }

        try {
          const friends = await areFriends(user.id, friendId)
          if (!friends) {
            return res.status(403).json({ data: null, error: 'You are not friends with this user' })
          }
        } catch (err) {
          console.error('Error checking friendship:', err)
          return res.status(500).json({ data: null, error: 'Failed to verify friendship' })
        }

        const { data, error } = await supabase
          .from('clips')
          .select('*')
          .eq('owner_id', friendId)
          .in('visibility', ['public', 'friends'])
          .order('created_at', { ascending: false })
        if (error) {
          console.error('Error fetching friend clips:', error)
          return res.status(500).json({ data: null, error: error.message })
        }

        return res.status(200).json({ data, error: null })
      }

      if (req.query.visibility === 'private') {
        const { data, error } = await supabase
          .from('clips')
          .select('*')
          .eq('visibility', 'private')
          .eq('owner_id', user.id)
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

        let friends = false
        try {
          friends = await areFriends(user.id, req.query.userId)
        } catch (err) {
          console.error('Error checking friendship:', err)
          return res.status(500).json({ data: null, error: 'Failed to verify friendship' })
        }

        const visibleClips = []
        for (const clip of data) {
          if (clip.owner_id === user.id) {
            visibleClips.push(clip)
          } else if (clip.visibility === 'public') {
            visibleClips.push(clip)
          } else if (clip.visibility === 'friends' && friends) {
            visibleClips.push(clip)
          }
        }

        return res.status(200).json({ data: visibleClips, error: null })
      }
      
      return res.status(400).json({ data: null, error: 'Invalid visibility parameter' })
    }

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
        const canWrite = await canWriteBlob(name, user, container)
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

    case 'DELETE': {
      const { user, error: authError } = await getAuthenticatedUser(req)
      if (authError) {
        return res.status(401).json({ data: null, error: authError })
      }

      const { id, name, container = CONTAINER_NAME } = req.body || {}
      if (id) {
        let clip
        try {
          clip = await findClip(id)
        } catch (err) {
          console.error('Error finding clip:', err)
          return res.status(500).json({ data: null, error: 'Failed to find clip' })
        }
        if (!clip) {
          return res.status(404).json({ data: null, error: 'Clip not found' })
        }
        if (clip.owner_id !== user.id) {
          return res.status(403).json({ data: null, error: 'You do not have permission to delete this clip' })
        }

        try {
          if (clip.blob_name) {
            await deleteBlob(clip.blob_name)
            await deleteBlob(getStreamBlobName(clip.blob_name))
          }
          if (clip.thumbnail_blob_name) {
            await deleteBlob(clip.thumbnail_blob_name, THUMBS_CONTAINER_NAME)
          }
        } catch (err) {
          console.error('Error deleting clip blobs:', err)
          return res.status(500).json({ data: null, error: 'Failed to delete clip files' })
        }

        const { error: tagsError } = await supabase.from('clip_tags').delete().eq('clip_id', id)
        if (tagsError) {
          console.error('Error deleting clip tags:', tagsError)
          return res.status(500).json({ data: null, error: tagsError.message })
        }

        const { error: deleteError } = await supabase.from('clips').delete().eq('id', id)
        if (deleteError) {
          console.error('Error deleting clip:', deleteError)
          return res.status(500).json({ data: null, error: deleteError.message })
        }

        return res.status(200).json({ data: { deleted: true }, error: null })
      }

      if (!name) {
        return res.status(400).json({ data: null, error: 'Missing "id" or "name" in request body' })
      }
      if (!SUPPORTED_CONTAINERS.includes(container)) {
        return res.status(400).json({ data: null, error: `Unsupported container "${container}"` })
      }

      try {
        const canDelete = await canWriteBlob(name, user, container)
        if (!canDelete) {
          return res.status(403).json({ data: null, error: 'You do not have permission to delete this blob' })
        }

        await deleteBlob(name, container)
        return res.status(200).json({ data: { deleted: true }, error: null })
      } catch (err) {
        console.error('Error deleting blob:', err)
        return res.status(500).json({ data: null, error: 'Failed to delete blob' })
      }
    }

    case 'PUT': {
      const { user, error: authError } = await getAuthenticatedUser(req)
      if (authError) {
        return res.status(401).json({ data: null, error: authError })
      }

      const { id } = req.body || {}
      if (!id) {
        return res.status(400).json({ data: null, error: 'Missing "id" in request body' })
      }
      const { details, userIds, labels, error: detailsError } = parseClipDetails(req.body)
      if (detailsError) {
        return res.status(400).json({ data: null, error: detailsError })
      }

      let clip
      try {
        clip = await findClip(id)
      } catch (err) {
        console.error('Error finding clip:', err)
        return res.status(500).json({ data: null, error: 'Failed to find clip' })
      }
      if (!clip) {
        return res.status(404).json({ data: null, error: 'Clip not found' })
      }
      if (clip.owner_id !== user.id) {
        return res.status(403).json({ data: null, error: 'You do not have permission to edit this clip' })
      }

      const { data: existingTags, error: existingTagsError } = await supabase
        .from('clip_tags')
        .select('id, user_id, label')
        .eq('clip_id', id)
      if (existingTagsError) {
        console.error('Error fetching clip tags:', existingTagsError)
        return res.status(500).json({ data: null, error: existingTagsError.message })
      }

      const lowerLabels = labels.map((label) => label.toLowerCase())
      const existingLabels = existingTags.filter((tag) => tag.label).map((tag) => tag.label.toLowerCase())
      const addedUserIds = userIds.filter((userId) => !existingTags.some((tag) => tag.user_id === userId))
      const addedLabels = labels.filter((label) => !existingLabels.includes(label.toLowerCase()))
      const removedTagIds = existingTags
        .filter((tag) => (tag.user_id ? !userIds.includes(tag.user_id) : !lowerLabels.includes(tag.label.toLowerCase())))
        .map((tag) => tag.id)

      try {
        const friends = await Promise.all(addedUserIds.map((userId) => areFriends(user.id, userId)))
        if (friends.includes(false)) {
          return res.status(403).json({ data: null, error: 'You can only tag your friends' })
        }
      } catch (err) {
        console.error('Error checking friendship:', err)
        return res.status(500).json({ data: null, error: 'Failed to verify friendship' })
      }

      const { data: updatedClip, error: updateError } = await supabase
        .from('clips')
        .update(details)
        .eq('id', id)
        .select()
        .single()
      if (updateError) {
        console.error('Error updating clip:', updateError)
        return res.status(500).json({ data: null, error: updateError.message })
      }

      if (addedUserIds.length > 0 || addedLabels.length > 0) {
        const { error: insertError } = await supabase.from('clip_tags').insert([
          ...addedUserIds.map((userId) => ({ clip_id: id, user_id: userId })),
          ...addedLabels.map((label) => ({ clip_id: id, label })),
        ])
        if (insertError) {
          console.error('Error adding clip tags:', insertError)
          return res.status(500).json({ data: null, error: insertError.message })
        }
      }

      if (removedTagIds.length > 0) {
        const { error: removeError } = await supabase.from('clip_tags').delete().in('id', removedTagIds)
        if (removeError) {
          console.error('Error removing clip tags:', removeError)
          return res.status(500).json({ data: null, error: removeError.message })
        }
      }

      const { data: tags, error: tagsError } = await supabase
        .from('clip_tags')
        .select('clip_id, user_id, label')
        .eq('clip_id', id)
      if (tagsError) {
        console.error('Error fetching clip tags:', tagsError)
        return res.status(500).json({ data: null, error: tagsError.message })
      }

      return res.status(200).json({ data: { ...updatedClip, tags }, error: null })
    }

    default:
      return res.status(405).json({ data: null, error: 'Method not allowed' })
  }
}

function parseTagLabels(value) {
  try {
    const labels = JSON.parse(value || '[]')
    if (!Array.isArray(labels)) {
      return []
    }
    return labels
      .filter((label) => typeof label === 'string')
      .map((label) => label.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

async function findClip(id) {
  const { data, error } = await supabase
    .from('clips')
    .select('id, owner_id, blob_name, thumbnail_blob_name')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to find clip: ${error.message}`)
  }
  return data
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
    return { ...data[0], container: CONTAINER_NAME }
  }

  const { data: thumbData, error: thumbError } = await supabase
    .from('clips')
    .select('owner_id')
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

async function canWriteBlob(blobName, user, container) {
  const clip = await findClipByBlob(blobName)
  if (clip) {
    return clip.owner_id === user.id && clip.container === container
  }
  return blobName.startsWith(`${user.id}/`) && SUPPORTED_CONTAINERS.includes(container)
}