import fs from 'node:fs';

/**
 * 图片文件头校验（magic bytes）：防止伪装图片上传（如改扩展名的可执行文件）。
 */
export function isValidImageFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    const n = fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    const b = buf.subarray(0, n);
    // PNG
    if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true;
    // JPEG
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
    // GIF
    if (b.length >= 6 && (b.toString('ascii', 0, 6) === 'GIF87a' || b.toString('ascii', 0, 6) === 'GIF89a')) return true;
    // WebP
    if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return true;
    return false;
  } catch {
    return false;
  }
}
