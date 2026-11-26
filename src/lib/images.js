// Item images in {DATA_DIR}/uploads, saved as {randomUUID}.{jpg|png|webp}.

import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { FieldError } from './errors.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Only names we generate. Anything else is never served from the db or touched on disk.
const FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const TMP_PREFIX = '.tmp-';

export const uploadsDir = (dataDir) => path.join(dataDir, 'uploads');

/** Detects the image type from the first 12 bytes (magic bytes), or returns null. */
export function detectImageType(head) {
  if (head.length < 12) return null;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg';
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

class FileTooLargeError extends Error {
  constructor() {
    super('File too large');
    this.statusCode = 413;
    this.errors = { file: `At most ${MAX_IMAGE_BYTES / 1024 / 1024} MB` };
  }
}

const notAnImage = () => new FieldError({ file: 'Must be a JPEG, PNG or WebP image' });

/**
 * Streams an upload to a temp file while checking its magic bytes, then renames it into place,
 * so a failed or rejected upload never leaves a (half-written) image behind.
 * `fileStream` is a multipart file stream (its `truncated` flag is set when the size limit was hit).
 * Returns the new file name.
 */
export async function saveImage(dataDir, fileStream) {
  const dir = uploadsDir(dataDir);
  const id = randomUUID();
  const tmp = path.join(dir, `${TMP_PREFIX}${id}`);

  let ext = null;
  let head = Buffer.alloc(0);
  const check = new Transform({
    transform(chunk, _enc, cb) {
      if (!ext) {
        head = Buffer.concat([head, chunk]);
        if (head.length >= 12) {
          ext = detectImageType(head);
          if (!ext) return cb(notAnImage());
        }
      }
      cb(null, chunk);
    },
    flush(cb) {
      if (!ext) return cb(notAnImage()); // fewer than 12 bytes
      cb();
    },
  });

  try {
    await pipeline(fileStream, check, createWriteStream(tmp, { flags: 'wx' }));
    if (fileStream.truncated) throw new FileTooLargeError();
  } catch (err) {
    await fs.rm(tmp, { force: true });
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') throw new FileTooLargeError();
    throw err;
  }

  const fileName = `${id}.${ext}`;
  await fs.rename(tmp, path.join(dir, fileName));
  return fileName;
}

/** Deletes an uploaded image. Missing files and unexpected names are ignored. */
export async function deleteImage(dataDir, fileName, log) {
  if (!fileName || !FILE_RE.test(fileName)) return;
  try {
    await fs.unlink(path.join(uploadsDir(dataDir), fileName));
  } catch (err) {
    if (err.code !== 'ENOENT') log?.error({ err, fileName }, 'Could not delete image');
  }
}

/** Removes temp files left behind by a crash during an upload. Run at startup. */
export async function removeTempFiles(dataDir) {
  const dir = uploadsDir(dataDir);
  const names = await fs.readdir(dir).catch(() => []);
  await Promise.all(names.filter((n) => n.startsWith(TMP_PREFIX)).map((n) => fs.rm(path.join(dir, n), { force: true })));
}
