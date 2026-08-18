import type { LipSyncMainProps } from '@vibee/atoms';
import { RENDER_URL } from '../config';

// Render server URL for media assets
export const RENDER_SERVER_URL = RENDER_URL;

/**
 * Convert relative paths to absolute URLs for render server
 * Used for both preview and export to ensure media loads correctly
 */
export function toAbsoluteUrl(path: string): string {
  if (!path) return path;

  // Don't touch blob URLs - they can't be accessed by render server
  if (path.startsWith('blob:')) {
    console.warn('[Media] Skipping blob URL (not accessible by render server):', path);
    return path;
  }

  // In dev mode, keep relative paths - Vite serves from public/ directly
  if (import.meta.env.DEV) {
    // Already absolute URL - return as-is
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    // Relative paths served by Vite dev server
    return path;
  }

  // Already absolute URL
  if (path.startsWith('http://') || path.startsWith('https://')) {
    // Replace localhost URLs with render server's public URL
    if (path.includes('localhost:3000') || path.includes('localhost:5174') || path.includes('localhost:3333')) {
      const relativePath = path.replace(/https?:\/\/localhost:\d+/, '');
      return `${RENDER_SERVER_URL}${relativePath}`;
    }
    return path;
  }

  // Relative path - prepend render server URL
  if (path.startsWith('/')) {
    return `${RENDER_SERVER_URL}${path}`;
  }

  return `${RENDER_SERVER_URL}/${path}`;
}

/**
 * Convert LipSyncMainProps media paths to absolute URLs
 */
export function convertPropsToAbsoluteUrls(props: LipSyncMainProps): LipSyncMainProps {
  return {
    ...props,
    lipSyncVideo: toAbsoluteUrl(props.lipSyncVideo),
    coverImage: toAbsoluteUrl(props.coverImage),
    backgroundMusic: props.backgroundMusic ? toAbsoluteUrl(props.backgroundMusic) : '',
    backgroundVideos: props.backgroundVideos
      .filter(url => !url.startsWith('blob:'))
      .map(toAbsoluteUrl),
  };
}
