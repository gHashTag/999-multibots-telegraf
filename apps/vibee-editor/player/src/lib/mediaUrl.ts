import type { LipSyncMainProps } from '@vibee/atoms';
import { RENDER_URL } from '../config';

// Render server URL — where render jobs are submitted.
export const RENDER_SERVER_URL = RENDER_URL;

// Where the bundled media in public/ is actually served from: this app itself.
// Absolute so the render server, which runs elsewhere, can fetch the same URL.
//
// Anything resolving a path that ships in this app's public/ must use this and
// NOT RENDER_SERVER_URL. The render server has no public/ directory — pointing
// media at it produces "File NOT found: /workspace/render/public/..." in its
// logs while the editor silently shows nothing.
export const MEDIA_ORIGIN =
  typeof window !== 'undefined' ? window.location.origin : RENDER_URL;

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
    // Replace localhost URLs with this app's public origin
    if (path.includes('localhost:3000') || path.includes('localhost:5174') || path.includes('localhost:3333')) {
      const relativePath = path.replace(/https?:\/\/localhost:\d+/, '');
      return `${MEDIA_ORIGIN}${relativePath}`;
    }
    return path;
  }

  // Relative path — resolve against THIS app's origin, not the render server's.
  //
  // These paths (/lipsync/lipsync.mp4, /backgrounds/business/bg*.mp4,
  // /audio/music/bgmusic.mp3) are served from this app's own public/ directory,
  // which is already deployed. Pointing them at the render server would mean
  // shipping a second ~500MB copy of the same media into that image just so it
  // could serve them back. The render server fetches them over HTTPS like any
  // other absolute URL.
  if (path.startsWith('/')) {
    return `${MEDIA_ORIGIN}${path}`;
  }

  return `${MEDIA_ORIGIN}/${path}`;
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
