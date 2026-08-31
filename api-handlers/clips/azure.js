import {
  BlobServiceClient,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from '@azure/storage-blob'

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING
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

const blobServiceClient = BlobServiceClient.fromConnectionString(CONNECTION_STRING)
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME)

const conn = parseConnectionString(CONNECTION_STRING)
const credential = new StorageSharedKeyCredential(conn.AccountName, conn.AccountKey)

export function generateSasUrl(blobName, permissions = 'r', containerName = CONTAINER_NAME) {
  const sasToken = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse(permissions),
      expiresOn: new Date(Date.now() + 3600 * 1000),
    },
    credential
  ).toString()

  return `${blobServiceClient.url}${containerName}/${encodeURIComponent(blobName)}?${sasToken}`
}

export { blobServiceClient, containerClient, CONTAINER_NAME, THUMBS_CONTAINER_NAME, SUPPORTED_CONTAINERS }
