/**
 * Converts any local filesystem path (Windows, macOS, or Linux) to a standards-compliant
 * file:// URL that Chromium can reliably load in <img>, <video>, and Image preloader elements.
 *
 * Windows paths (e.g. `C:\renders\shot_#0001.png`) are converted to:
 * `file:///C:/renders/shot_%230001.png`
 *
 * POSIX paths (e.g. `/home/user/renders/shot_#0001.png`) are converted to:
 * `file:///home/user/renders/shot_%230001.png`
 */
export function toFileUrl(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') return '';

  // Normalize Windows backslashes to forward slashes
  let normalized = filePath.replace(/\\/g, '/');

  // For Windows drive letters (e.g. C:/...), ensure a leading slash for file:///
  if (/^[a-zA-Z]:/.test(normalized)) {
    normalized = `/${normalized}`;
  }

  // Ensure starting slash
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  // encodeURI encodes spaces and Unicode characters; manually encode '#' and '?'
  // because Chromium treats '#' as URL fragment and '?' as query string in file:// URLs
  return encodeURI(`file://${normalized}`).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

/**
 * Converts any local filesystem path into an `rn-media://` streaming URL.
 * Handled via `protocol.handle('rn-media')` which streams files directly off disk.
 */
export function toRnMediaUrl(filePath: string): string {
  if (!filePath || typeof filePath !== 'string') return '';
  return `rn-media://local/file?path=${encodeURIComponent(filePath)}`;
}
