// =============================================
// JADOMI RUSH — Cloudflare R2 Storage
// Upload/download/suppression fichiers lourds STL
// API S3-compatible, region Europe (EEUR)
// =============================================

const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const zlib = require('zlib');

// ===== Config =====
function getConfig() {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'jadomi-rush-fichiers';

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return { accountId, accessKeyId, secretAccessKey, bucket };
}

let _client = null;
function getClient() {
  if (_client) return _client;
  const cfg = getConfig();
  if (!cfg) return null;

  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey
    }
  });
  return _client;
}

function getBucket() {
  return (getConfig() || {}).bucket || 'jadomi-rush-fichiers';
}

// ===== Chiffrement AES-256-GCM =====
function getEncryptionKey() {
  const k = process.env.RUSH_ENCRYPTION_KEY || '';
  if (k && /^[0-9a-fA-F]{64}$/.test(k)) return Buffer.from(k, 'hex');
  return crypto.createHash('sha256').update('JADOMI_DEV_FALLBACK_KEY').digest();
}

function chiffrerBuffer(buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv (12) + tag (16) + encrypted data
  return Buffer.concat([iv, tag, encrypted]);
}

function dechiffrerBuffer(buffer) {
  if (!buffer || buffer.length < 28) return buffer;
  const iv = buffer.slice(0, 12);
  const tag = buffer.slice(12, 28);
  const encrypted = buffer.slice(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

// ===== Compression zlib pour STL =====
function compresserSiSTL(buffer, format) {
  const fmt = (format || '').toLowerCase();
  if (['stl', 'obj', 'ply', '3mf'].includes(fmt)) {
    return zlib.gzipSync(buffer, { level: 6 });
  }
  return buffer;
}

function decompresserSiSTL(buffer, format) {
  const fmt = (format || '').toLowerCase();
  if (['stl', 'obj', 'ply', '3mf'].includes(fmt)) {
    try {
      return zlib.gunzipSync(buffer);
    } catch (e) {
      // Pas compresse, retourner tel quel
      return buffer;
    }
  }
  return buffer;
}

// ===== Upload vers R2 =====
async function uploadToR2(buffer, options = {}) {
  const client = getClient();
  if (!client) {
    throw new Error('Cloudflare R2 non configure — ajoutez CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY dans .env');
  }

  const {
    format = 'stl',
    contentType = 'application/octet-stream',
    demandeId = 'unknown',
    compress = true,
    encrypt = true
  } = options;

  // Nom fichier = UUID aleatoire (jamais de nom original)
  const fileId = crypto.randomUUID();
  const ext = format.toLowerCase();
  const key = `${demandeId}/${fileId}.${ext}${compress ? '.gz' : ''}${encrypt ? '.enc' : ''}`;

  // Pipeline : compression → chiffrement
  let processedBuffer = buffer;
  if (compress) processedBuffer = compresserSiSTL(processedBuffer, format);
  if (encrypt) processedBuffer = chiffrerBuffer(processedBuffer);

  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: processedBuffer,
    ContentType: contentType,
    Metadata: {
      'original-format': format,
      'compressed': String(compress),
      'encrypted': String(encrypt),
      'demande-id': String(demandeId),
      'upload-date': new Date().toISOString()
    }
  });

  await client.send(command);

  return {
    key,
    fileId,
    taille_stockee: processedBuffer.length,
    taille_originale: buffer.length,
    compresse: compress,
    chiffre: encrypt
  };
}

// ===== Lien presigne temporaire (48h) =====
async function getPresignedUrl(key, expiresInSeconds = 48 * 60 * 60) {
  const client = getClient();
  if (!client) return null;

  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key
  });

  const url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  return url;
}

// ===== Download depuis R2 (avec dechiffrement + decompression) =====
async function downloadFromR2(key, format = 'stl') {
  const client = getClient();
  if (!client) throw new Error('R2 non configure');

  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key
  });

  const response = await client.send(command);
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  let buffer = Buffer.concat(chunks);

  // Pipeline inverse : dechiffrement → decompression
  const isEncrypted = key.endsWith('.enc') || (response.Metadata && response.Metadata.encrypted === 'true');
  const isCompressed = key.includes('.gz') || (response.Metadata && response.Metadata.compressed === 'true');

  if (isEncrypted) buffer = dechiffrerBuffer(buffer);
  if (isCompressed) buffer = decompresserSiSTL(buffer, format);

  return buffer;
}

// ===== Suppression d'un fichier =====
async function deleteFromR2(key) {
  const client = getClient();
  if (!client) return false;

  const command = new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: key
  });

  await client.send(command);
  return true;
}

// ===== Nettoyage fichiers expires (> 72h) =====
async function nettoyerFichiersExpires() {
  const client = getClient();
  if (!client) {
    console.warn('[R2 cleanup] R2 non configure, skip');
    return { deleted: 0 };
  }

  const seuilMs = 72 * 60 * 60 * 1000; // 72h
  const maintenant = Date.now();
  let deleted = 0;
  let continuationToken = undefined;

  do {
    const listCommand = new ListObjectsV2Command({
      Bucket: getBucket(),
      MaxKeys: 1000,
      ContinuationToken: continuationToken
    });

    const response = await client.send(listCommand);
    const objects = response.Contents || [];

    for (const obj of objects) {
      const age = maintenant - new Date(obj.LastModified).getTime();
      if (age > seuilMs) {
        try {
          await deleteFromR2(obj.Key);
          deleted++;
        } catch (e) {
          console.warn('[R2 cleanup] Erreur suppression:', obj.Key, e.message);
        }
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  console.log(`[R2 cleanup] ${deleted} fichiers expires supprimes`);
  return { deleted };
}

// ===== Verifier si R2 est disponible =====
function isR2Available() {
  return !!getConfig();
}

module.exports = {
  uploadToR2,
  getPresignedUrl,
  downloadFromR2,
  deleteFromR2,
  nettoyerFichiersExpires,
  isR2Available,
  chiffrerBuffer,
  dechiffrerBuffer,
  compresserSiSTL,
  decompresserSiSTL
};
