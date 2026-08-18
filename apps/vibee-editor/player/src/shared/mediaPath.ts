/**
 * Media Path Resolution for VIBEE Player
 *
 * Browser-compatible version (no staticFile)
 */

// ============================================================
// Main Function
// ============================================================

/**
 * Resolve media path for browser playback
 *
 * Handles:
 * - External URLs (http/https) - returned as-is
 * - Local paths (/path/to/file) - returned as-is (Vite proxy handles them)
 *
 * @param path - Media path or URL
 * @returns Resolved path for browser
 */
export function resolveMediaPath(path: string): string {
  // Empty path
  if (!path) return '';

  // External URLs - use as-is
  if (path.includes('://')) {
    return path;
  }

  // Local paths - return as-is for Vite proxy
  return path;
}
