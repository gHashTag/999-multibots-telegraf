/**
 * Shared Media Path Resolution for VIBEE Remotion
 *
 * Unified utility for resolving media paths across
 * Remotion compositions, TemplateFactory, and Player.
 */

import { staticFile } from 'remotion';

// ============================================================
// Types
// ============================================================

export interface ResolveMediaOptions {
  /** Resolve {{placeholder}} syntax to default assets */
  resolvePlaceholders?: boolean;
}

// ============================================================
// Placeholder Mappings
// ============================================================

const PLACEHOLDER_DEFAULTS: Record<string, string> = {
  lipsync: '/lipsync/lipsync.mp4',
  cover: '/covers/cover.jpeg',
  music: '/music/corporate.mp3',
};

const BROLL_VIDEOS = [
  '/backgrounds/business/00.mp4',
  '/backgrounds/business/01.mp4',
  '/backgrounds/business/02.mp4',
  '/backgrounds/business/03.mp4',
  '/backgrounds/business/04.mp4',
];

function resolvePlaceholder(placeholder: string): string {
  // Check direct mappings
  for (const [key, value] of Object.entries(PLACEHOLDER_DEFAULTS)) {
    if (placeholder.includes(key)) {
      return staticFile(value);
    }
  }

  // B-roll/background - random selection
  if (placeholder.includes('broll') || placeholder.includes('background')) {
    const randomIndex = Math.floor(Math.random() * BROLL_VIDEOS.length);
    return staticFile(BROLL_VIDEOS[randomIndex]);
  }

  // Fallback to lipsync
  return staticFile(PLACEHOLDER_DEFAULTS.lipsync);
}

// ============================================================
// Main Function
// ============================================================

/**
 * Resolve media path for Remotion rendering
 *
 * Handles:
 * - External URLs (http/https) - returned as-is
 * - Placeholders ({{lipsync}}) - resolved to default assets
 * - Local paths (/path/to/file) - wrapped with staticFile
 *
 * @param path - Media path or URL
 * @param options - Resolution options
 * @returns Resolved path for Remotion
 */
export function resolveMediaPath(
  path: string,
  options?: ResolveMediaOptions
): string {
  // Empty path
  if (!path) return '';

  // Placeholders: {{lipsync}}, {{background}}, etc.
  if (options?.resolvePlaceholders && path.startsWith('{{') && path.endsWith('}}')) {
    const placeholder = path.slice(2, -2);
    return resolvePlaceholder(placeholder);
  }

  // External URLs - use as-is
  if (path.includes('://')) {
    return path;
  }

  // Paths already prefixed with /public/ (batch-render test mode)
  if (path.startsWith('/public/')) {
    return path;
  }

  // Local paths - use staticFile
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return staticFile(cleanPath);
}
