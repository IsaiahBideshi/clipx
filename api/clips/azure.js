import {
  BlobServiceClient,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from '@azure/storage-blob'

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING
const CONTAINER_NAME = 'clips'

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

export function generateSasUrl(blobName, permissions = 'r') {
  const sasToken = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER_NAME,
      blobName,
      permissions: BlobSASPermissions.parse(permissions),
      expiresOn: new Date(Date.now() + 3600 * 1000),
    },
    credential
  ).toString()

  return `${blobServiceClient.url}${CONTAINER_NAME}/${encodeURIComponent(blobName)}?${sasToken}`
}

export { blobServiceClient, containerClient, CONTAINER_NAME }
