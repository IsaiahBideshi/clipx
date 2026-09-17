import {
  BlobServiceClient,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from '@azure/storage-blob'

const CONTAINER_NAME = 'clips'
const THUMBS_CONTAINER_NAME = 'clip-thumbnails'
const SUPPORTED_CONTAINERS = [CONTAINER_NAME, THUMBS_CONTAINER_NAME]

function parseConnectionString(str) {
  const parts = {}
  for (const part of str.split(';')) {
    const [key, value] = part.split('=')
    if (key) parts[key.trim()] = value?.trim() ?? ''
  }
  return parts
}

let _blobServiceClient, _credential

function getBlobServiceClient() {
  if (!_blobServiceClient) {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
    if (!connectionString) throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set')
    _blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
  }
  return _blobServiceClient
}

function getCredential() {
  if (!_credential) {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
    if (!connectionString) throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set')
    const conn = parseConnectionString(connectionString)
    _credential = new StorageSharedKeyCredential(conn.AccountName, conn.AccountKey)
  }
  return _credential
}

function getContainerClient(containerName = CONTAINER_NAME) {
  return getBlobServiceClient().getContainerClient(containerName)
}

const blobServiceClient = new Proxy({}, { get: (_, prop) => getBlobServiceClient()[prop] })
const containerClient = new Proxy({}, { get: (_, prop) => getContainerClient()[prop] })

export function encodeBlobPath(blobName) {
  return String(blobName)
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function getPublicBlobUrl(blobName, containerName = CONTAINER_NAME) {
  return `${getBlobServiceClient().url}${containerName}/${encodeBlobPath(blobName)}`;
}

function resolveBlobIdentifier(blobNameOrUrl, containerName = CONTAINER_NAME) {
  if (typeof blobNameOrUrl !== 'string' || !blobNameOrUrl) {
    throw new Error('Missing blob name or URL')
  }
  const trimmed = blobNameOrUrl.trim()
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return { blobName: trimmed, containerName }
  }
  const withoutQuery = trimmed.split('?')[0].split('#')[0]
  try {
    const parsed = new URL(withoutQuery)
    const segments = parsed.pathname.split('/').filter(Boolean)
    if (segments.length === 0) {
      throw new Error(`Cannot parse blob URL "${trimmed}"`)
    }
    const [maybeContainer, ...rest] = segments
    if (SUPPORTED_CONTAINERS.includes(maybeContainer)) {
      const blobName = rest
        .map((segment) => {
          try {
            return decodeURIComponent(segment)
          } catch {
            return segment
          }
        })
        .join('/')
      if (!blobName) {
        throw new Error(`Cannot parse blob URL "${trimmed}"`)
      }
      return { blobName, containerName: maybeContainer }
    }
    return { blobName: trimmed, containerName }
  } catch (err) {
    if (err.message?.startsWith('Cannot parse blob URL')) throw err
    return { blobName: trimmed, containerName }
  }
}

export function getSasToken(blobNameOrUrl, permissions = 'r', containerName = CONTAINER_NAME) {
  const { blobName, containerName: resolvedContainer } = resolveBlobIdentifier(blobNameOrUrl, containerName)
  const perms = BlobSASPermissions.parse(permissions)

  return generateBlobSASQueryParameters(
    {
      containerName: resolvedContainer,
      blobName,
      permissions: perms,
      expiresOn: new Date(Date.now() + 3600 * 1000),
    },
    getCredential()
  ).toString()
}

export async function getStreamUrl(blobNameOrUrl, containerName = CONTAINER_NAME, permissions = 'r') {
  const { blobName, containerName: resolvedContainer } = resolveBlobIdentifier(blobNameOrUrl, containerName)
  const perms = BlobSASPermissions.parse(permissions)

  if (perms.read) {
    const container = getBlobServiceClient().getContainerClient(resolvedContainer)
    const exists = await container.getBlobClient(blobName).exists()
    if (!exists) {
      throw new BlobNotFoundError(blobName, resolvedContainer)
    }
  }

  return `${getPublicBlobUrl(blobName, resolvedContainer)}?${getSasToken(blobName, perms.toString(), resolvedContainer)}`
}

export async function deleteBlob(blobName, containerName = CONTAINER_NAME) {
  const container = getBlobServiceClient().getContainerClient(containerName)
  await container.getBlobClient(blobName).deleteIfExists()
}

export async function generateSasUrl(blobName, permissions = 'r', containerName = CONTAINER_NAME) {
  return getStreamUrl(blobName, containerName, permissions)
}

export class BlobNotFoundError extends Error {
  constructor(blobName, containerName) {
    super(`Blob "${blobName}" not found in container "${containerName}"`)
    this.name = 'BlobNotFoundError'
    this.statusCode = 404
  }
}

export { blobServiceClient, containerClient, CONTAINER_NAME, THUMBS_CONTAINER_NAME, SUPPORTED_CONTAINERS }
