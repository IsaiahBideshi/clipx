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

export async function deleteBlob(blobName, containerName = CONTAINER_NAME) {
  const container = getBlobServiceClient().getContainerClient(containerName)
  await container.getBlobClient(blobName).deleteIfExists()
}

export async function generateSasUrl(blobName, permissions = 'r', containerName = CONTAINER_NAME) {
  const perms = BlobSASPermissions.parse(permissions)

  if (perms.read) {
    const container = getBlobServiceClient().getContainerClient(containerName)
    const exists = await container.getBlobClient(blobName).exists()
    if (!exists) {
      throw new BlobNotFoundError(blobName, containerName)
    }
  }

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: perms,
      expiresOn: new Date(Date.now() + 3600 * 1000),
    },
    getCredential()
  ).toString()

  return `${getBlobServiceClient().url}${containerName}/${encodeBlobPath(blobName)}?${sasToken}`
}

export class BlobNotFoundError extends Error {
  constructor(blobName, containerName) {
    super(`Blob "${blobName}" not found in container "${containerName}"`)
    this.name = 'BlobNotFoundError'
    this.statusCode = 404
  }
}

export { blobServiceClient, containerClient, CONTAINER_NAME, THUMBS_CONTAINER_NAME, SUPPORTED_CONTAINERS }
