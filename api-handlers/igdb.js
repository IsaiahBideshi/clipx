let tokenRequest = null

async function requestToken() {
  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.IGDB_CLIENT_ID,
      client_secret: process.env.IGDB_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  })
  if (!response.ok) {
    throw new Error(`Twitch token request failed (${response.status}): ${await response.text()}`)
  }
  const { access_token: accessToken } = await response.json()
  return accessToken
}

function getToken() {
  tokenRequest ??= requestToken().catch((error) => {
    tokenRequest = null
    throw error
  })
  return tokenRequest
}

function sendQuery(endpoint, body, token) {
  return fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': process.env.IGDB_CLIENT_ID,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain',
      Accept: 'application/json',
    },
    body,
  })
}

export async function queryIgdb(endpoint, body) {
  const usedRequest = getToken()
  let response = await sendQuery(endpoint, body, await usedRequest)
  if (response.status === 401) {
    if (tokenRequest === usedRequest) {
      tokenRequest = null
    }
    response = await sendQuery(endpoint, body, await getToken())
  }
  if (!response.ok) {
    throw new Error(`IGDB request failed (${response.status}): ${await response.text()}`)
  }
  return response.json()
}
