const VISIBILITIES = ['public', 'private', 'friends']
const MAX_TAGS = 20
const MAX_LABEL_LENGTH = 50

export function parseClipDetails(body) {
  const { title, visibility, gameId = null, userIds = [], labels = [] } = body || {}

  const trimmedTitle = typeof title === 'string' ? title.trim() : ''
  if (!trimmedTitle) {
    return { error: 'Missing "title"' }
  }
  if (!VISIBILITIES.includes(visibility)) {
    return { error: 'Invalid "visibility"' }
  }
  if (gameId !== null && !(Number.isSafeInteger(gameId) && gameId > 0)) {
    return { error: 'Invalid "gameId"' }
  }
  if (!Array.isArray(userIds) || !Array.isArray(labels) || [...userIds, ...labels].some((tag) => typeof tag !== 'string')) {
    return { error: 'Invalid tags' }
  }

  const uniqueUserIds = [...new Set(userIds)]
  const trimmedLabels = labels.map((label) => label.trim()).filter(Boolean)
  const uniqueLabels = [...new Map(trimmedLabels.map((label) => [label.toLowerCase(), label])).values()]

  if (uniqueLabels.some((label) => [...label].length > MAX_LABEL_LENGTH)) {
    return { error: `Tags must be ${MAX_LABEL_LENGTH} characters or fewer` }
  }
  if (uniqueUserIds.length + uniqueLabels.length > MAX_TAGS) {
    return { error: `A clip can have at most ${MAX_TAGS} tags` }
  }

  return {
    details: { title: trimmedTitle, visibility, game_id: gameId },
    userIds: uniqueUserIds,
    labels: uniqueLabels,
    error: null,
  }
}
