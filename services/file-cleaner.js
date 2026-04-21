// =============================================
// JADOMI RUSH — Nettoyage metadonnees fichiers
// Supprime EXIF photos, metadata STL/3MF
// =============================================

const crypto = require('crypto');

// Supprimer metadonnees EXIF d'une image JPEG
// Methode simple : trouver et retirer les segments APP1 (EXIF)
function stripExifJpeg(buffer) {
  if (!buffer || buffer.length < 4) return buffer;
  // Verifier magic bytes JPEG
  if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) return buffer;

  const chunks = [];
  let i = 2;
  chunks.push(Buffer.from([0xFF, 0xD8])); // SOI

  while (i < buffer.length - 1) {
    if (buffer[i] !== 0xFF) { i++; continue; }

    const marker = buffer[i + 1];

    // APP1 (0xE1) = EXIF, APP2-APP15 = autres metadonnees
    if (marker >= 0xE1 && marker <= 0xEF) {
      // Skip ce segment
      if (i + 3 < buffer.length) {
        const segLen = buffer.readUInt16BE(i + 2);
        i += 2 + segLen;
      } else {
        i += 2;
      }
      continue;
    }

    // COM (0xFE) = commentaires
    if (marker === 0xFE) {
      if (i + 3 < buffer.length) {
        const segLen = buffer.readUInt16BE(i + 2);
        i += 2 + segLen;
      } else {
        i += 2;
      }
      continue;
    }

    // SOS (0xDA) = debut des donnees image, copier le reste
    if (marker === 0xDA) {
      chunks.push(buffer.slice(i));
      break;
    }

    // Autre segment : conserver
    if (i + 3 < buffer.length) {
      const segLen = buffer.readUInt16BE(i + 2);
      chunks.push(buffer.slice(i, i + 2 + segLen));
      i += 2 + segLen;
    } else {
      chunks.push(buffer.slice(i));
      break;
    }
  }

  return Buffer.concat(chunks);
}

// Supprimer metadonnees PNG (tEXt, iTXt, zTXt chunks)
function stripMetadataPng(buffer) {
  if (!buffer || buffer.length < 8) return buffer;
  // Verifier PNG signature
  const sig = buffer.slice(0, 8);
  if (sig.toString('hex') !== '89504e470d0a1a0a') return buffer;

  const chunks = [sig];
  let i = 8;

  while (i < buffer.length) {
    if (i + 8 > buffer.length) break;
    const len = buffer.readUInt32BE(i);
    const type = buffer.slice(i + 4, i + 8).toString('ascii');
    const totalLen = 12 + len; // 4 len + 4 type + data + 4 crc

    // Skip metadata chunks
    if (['tEXt', 'iTXt', 'zTXt', 'eXIf'].includes(type)) {
      i += totalLen;
      continue;
    }

    chunks.push(buffer.slice(i, i + totalLen));
    i += totalLen;
  }

  return Buffer.concat(chunks);
}

// Nettoyer les metadonnees d'un fichier selon son format
function nettoyerMetadonnees(buffer, format) {
  if (!buffer) return buffer;

  const fmt = (format || '').toLowerCase();

  if (fmt === 'jpg' || fmt === 'jpeg') {
    return stripExifJpeg(buffer);
  }

  if (fmt === 'png') {
    return stripMetadataPng(buffer);
  }

  // STL binaire : les 80 premiers octets sont un header libre
  // Souvent contient le nom du logiciel/fichier — on le nettoie
  if (fmt === 'stl' && buffer.length > 84) {
    const cleaned = Buffer.from(buffer);
    // Remplacer header par du vide (80 bytes)
    const header = Buffer.alloc(80, 0);
    Buffer.from('JADOMI Rush Export').copy(header);
    header.copy(cleaned, 0);
    return cleaned;
  }

  // 3MF/OBJ/PLY : pas de nettoyage specifique necessaire
  return buffer;
}

// Calculer checksum SHA-256
function calculerChecksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Detecter le format depuis le nom de fichier
function detecterFormat(filename) {
  if (!filename) return 'autre';
  const ext = filename.split('.').pop().toLowerCase();
  const formats = {
    stl: 'stl', obj: 'stl', ply: 'stl', '3mf': 'stl',
    jpg: 'photo_dents', jpeg: 'photo_dents', png: 'photo_dents', webp: 'photo_dents',
    dcm: 'autre', zip: 'autre'
  };
  return formats[ext] || 'autre';
}

// Detecter le type MIME
function detecterMime(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  const mimes = {
    stl: 'model/stl', obj: 'model/obj', ply: 'model/ply',
    '3mf': 'model/3mf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp', zip: 'application/zip'
  };
  return mimes[ext] || 'application/octet-stream';
}

module.exports = {
  nettoyerMetadonnees,
  calculerChecksum,
  detecterFormat,
  detecterMime,
  stripExifJpeg,
  stripMetadataPng
};
