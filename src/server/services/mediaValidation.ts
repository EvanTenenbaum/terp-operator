import { fileTypeFromFile } from 'file-type';
import path from 'node:path';

const ALLOWED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/heic': ['.heic'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov']
} as const;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateBatchIdFormat(batchId: string): void {
  if (!UUID_REGEX.test(batchId)) {
    throw new Error('Invalid batch ID format');
  }
}

export function sanitizeFilename(filename: string): string {
  const ext = path.extname(filename);
  const base = filename.slice(0, filename.length - ext.length);
  const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
  return `${sanitized}${ext}`;
}

export interface MagicBytesResult {
  valid: boolean;
  actualType?: string;
}

export async function validateMagicBytes(filePath: string): Promise<MagicBytesResult> {
  try {
    const fileType = await fileTypeFromFile(filePath);
    if (!fileType) return { valid: false };

    const allowed = Object.keys(ALLOWED_TYPES);
    if (!allowed.includes(fileType.mime)) {
      return { valid: false };
    }

    return { valid: true, actualType: fileType.mime };
  } catch {
    return { valid: false };
  }
}
