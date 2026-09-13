import { BlobServiceClient } from '@azure/storage-blob'

const AVATAR_CONTAINER = process.env.AZURE_AVATAR_CONTAINER || 'user-avatars'

let _blobServiceClient

function getBlobServiceClient() {
  if (!_blobServiceClient) {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
    if (!connectionString) throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set')
    _blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
  }
  return _blobServiceClient
}

function encodeBlobPath(blobName) {
  return String(blobName)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

export function getAvatarBlobUrl(blobName) {
  return `${getBlobServiceClient().url}${AVATAR_CONTAINER}/${encodeBlobPath(blobName)}`
}

export function extractAvatarBlobName(avatarUrl) {
  const prefix = `${getBlobServiceClient().url}${AVATAR_CONTAINER}/`
  if (typeof avatarUrl !== 'string' || !avatarUrl.startsWith(prefix)) {
    return null
  }
  const raw = avatarUrl.slice(prefix.length).split('?')[0].split('#')[0]
  if (!raw) {
    return null
  }
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

export async function uploadAvatarBlob({ blobName, buffer, contentType }) {
  const containerClient = getBlobServiceClient().getContainerClient(AVATAR_CONTAINER)
  const blockBlobClient = containerClient.getBlockBlobClient(blobName)
  try {
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: contentType },
    })
    return getAvatarBlobUrl(blobName)
  } catch (error) {
    throw error
  }
}

export async function deleteAvatarBlob(blobName) {
  const containerClient = getBlobServiceClient().getContainerClient(AVATAR_CONTAINER)
  try {
    await containerClient.getBlobClient(blobName).deleteIfExists()
  } catch (error) {
    throw error
  }
}