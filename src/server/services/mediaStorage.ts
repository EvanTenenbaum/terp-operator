import sharp from 'sharp';
import fsp from 'node:fs/promises';
import path from 'node:path';

const THUMB_DIR = '.thumbnails';

function getMediaStoragePath(): string {
  return process.env.MEDIA_STORAGE_PATH || 'storage/media';
}

export interface UploadResult {
  filePath: string;
  fileSize: number;
  mimeType: string;
  thumbnailPath?: string;
  mediumPath?: string;
}

export async function uploadMedia(
  file: { path: string; originalname: string; size: number; mimetype: string },
  batchId: string
): Promise<UploadResult> {
  const result: UploadResult = {
    filePath: file.path,
    fileSize: file.size,
    mimeType: file.mimetype
  };

  if (file.mimetype.startsWith('image/')) {
    // mediaId is the future batch_media.id — caller will reconcile; we use a stable suffix from the saved path
    const mediaId = path.basename(file.path, path.extname(file.path));
    const thumbs = await generateThumbnails(file.path, mediaId, batchId);
    result.thumbnailPath = thumbs.thumb;
    result.mediumPath = thumbs.medium;
  }

  return result;
}

export async function deleteMedia(
  filePath: string,
  thumbPath?: string,
  mediumPath?: string
): Promise<void> {
  const candidates = [filePath, thumbPath, mediumPath].filter((p): p is string => Boolean(p));
  await Promise.all(
    candidates.map(async (p) => {
      try {
        await fsp.unlink(p);
      } catch {
        // best-effort: don't throw if file doesn't exist
      }
    })
  );
}

export async function generateThumbnails(
  srcPath: string,
  mediaId: string,
  batchId: string
): Promise<{ thumb: string; medium: string }> {
  const thumbDir = path.join(getMediaStoragePath(), THUMB_DIR, batchId);
  await fsp.mkdir(thumbDir, { recursive: true });

  const thumb = path.join(thumbDir, `${mediaId}_thumb.jpg`);
  const medium = path.join(thumbDir, `${mediaId}_medium.jpg`);

  await sharp(srcPath).rotate().resize(200, 200, { fit: 'cover' }).jpeg({ quality: 80 }).toFile(thumb);
  await sharp(srcPath).rotate().resize(800, 800, { fit: 'inside' }).jpeg({ quality: 85 }).toFile(medium);

  return { thumb, medium };
}

export async function convertHeicToJpeg(heicPath: string): Promise<string> {
  const dir = path.dirname(heicPath);
  const base = path.basename(heicPath, path.extname(heicPath));
  const jpegPath = path.join(dir, `${base}.jpg`);

  await sharp(heicPath).rotate().jpeg({ quality: 90 }).toFile(jpegPath);
  await fsp.unlink(heicPath);

  return jpegPath;
}
