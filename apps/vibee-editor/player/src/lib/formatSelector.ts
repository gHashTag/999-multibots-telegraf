/**
 * Format Selector for Video Optimization
 *
 * Research Basis (2025-2026):
 * - VP9/WebM is 30% smaller than H.264/MP4
 * - AV1 is 50% smaller but not yet widely supported
 * - Chrome/Firefox prefer VP9, Safari prefers H.264
 *
 * Strategy:
 * 1. Detect browser codec support
 * 2. Select optimal format based on support
 * 3. Return URL with correct extension
 */

interface CodecSupport {
  vp9: boolean;
  av1: boolean;
  h264: boolean;
  hevc: boolean;
}

// Cache codec detection results
let cachedCodecSupport: CodecSupport | null = null;

/**
 * Detect supported video codecs
 */
export async function detectCodecSupport(): Promise<CodecSupport> {
  if (cachedCodecSupport) {
    return cachedCodecSupport;
  }

  const video = document.createElement('video');

  // Test codec support using canPlayType
  const support: CodecSupport = {
    // VP9 in WebM container
    vp9: video.canPlayType('video/webm; codecs="vp9"') === 'probably' ||
         video.canPlayType('video/webm; codecs="vp9"') === 'maybe',

    // AV1 in WebM or MP4 container
    av1: video.canPlayType('video/webm; codecs="av01.0.05M.08"') === 'probably' ||
         video.canPlayType('video/mp4; codecs="av01.0.05M.08"') === 'probably',

    // H.264 in MP4 container
    h264: video.canPlayType('video/mp4; codecs="avc1.42E01E"') === 'probably' ||
          video.canPlayType('video/mp4; codecs="avc1.42E01E"') === 'maybe',

    // HEVC/H.265 (Safari)
    hevc: video.canPlayType('video/mp4; codecs="hvc1"') === 'probably',
  };

  cachedCodecSupport = support;

  console.log('[FormatSelector] Detected codec support:', support);

  return support;
}

/**
 * Get browser-specific format preference
 */
function getBrowserPreference(): 'vp9' | 'h264' {
  const ua = navigator.userAgent.toLowerCase();

  // Safari prefers H.264 (no VP9 support)
  if (ua.includes('safari') && !ua.includes('chrome')) {
    return 'h264';
  }

  // Chrome/Firefox/Edge prefer VP9
  return 'vp9';
}

/**
 * Select optimal video format based on codec support
 * Priority: AV1 (-50%) > VP9 (-30%) > H.264 optimized > H.264 original
 *
 * @param baseUrl - Original video URL (e.g., "/backgrounds/business/bg00.mp4")
 * @returns Optimal URL (e.g., "/backgrounds/business/bg00.av1.mp4" for AV1)
 */
export async function selectOptimalFormat(baseUrl: string): Promise<string> {
  // Skip if not an MP4, already optimized, or not a background video
  // Only backgrounds have pre-encoded optimized variants (av1/webm/opt)
  if (!baseUrl.endsWith('.mp4') || baseUrl.includes('.av1.') || baseUrl.includes('_opt.') || !baseUrl.includes('/backgrounds/')) {
    return baseUrl;
  }

  const support = await detectCodecSupport();
  const preference = getBrowserPreference();

  // Check if optimized variant exists (silent - no console 404 errors)
  const checkExists = async (url: string): Promise<boolean> => {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  };

  // Priority 1: AV1 (50% smaller than H.264!)
  if (support.av1) {
    const av1Url = baseUrl.replace('.mp4', '.av1.mp4');
    if (await checkExists(av1Url)) {
      console.log('[FormatSelector] Using AV1 (-50%):', av1Url);
      return av1Url;
    }
  }

  // Priority 2: VP9/WebM (30% smaller than H.264)
  if (support.vp9 && preference === 'vp9') {
    const webmUrl = baseUrl.replace('.mp4', '.webm');
    if (await checkExists(webmUrl)) {
      console.log('[FormatSelector] Using VP9 (-30%):', webmUrl);
      return webmUrl;
    }
  }

  // Priority 3: Optimized H.264 (CRF 28)
  const optUrl = baseUrl.replace('.mp4', '_opt.mp4');
  if (await checkExists(optUrl)) {
    console.log('[FormatSelector] Using optimized H.264:', optUrl);
    return optUrl;
  }

  // Fallback to original
  console.log('[FormatSelector] Using original:', baseUrl);
  return baseUrl;
}

/**
 * Batch select optimal formats for multiple URLs
 * More efficient than calling selectOptimalFormat for each URL
 */
export async function selectOptimalFormats(urls: string[]): Promise<Map<string, string>> {
  const support = await detectCodecSupport();
  const preference = getBrowserPreference();
  const results = new Map<string, string>();

  // Prepare variant URLs
  const checks: Array<{ original: string; variant: string; type: 'webm' | 'opt' }> = [];

  for (const url of urls) {
    if (!url.endsWith('.mp4') || !url.includes('/backgrounds/')) {
      results.set(url, url);
      continue;
    }

    // Check VP9 first if supported
    if (support.vp9 && preference === 'vp9') {
      checks.push({
        original: url,
        variant: url.replace('.mp4', '.webm'),
        type: 'webm',
      });
    }

    // Check optimized H.264
    checks.push({
      original: url,
      variant: url.replace('.mp4', '_opt.mp4'),
      type: 'opt',
    });
  }

  // Batch HEAD requests
  const responses = await Promise.allSettled(
    checks.map((check) =>
      fetch(check.variant, { method: 'HEAD' }).then((r) => ({
        ...check,
        exists: r.ok,
      }))
    )
  );

  // Process results
  const availableVariants = new Map<string, { url: string; priority: number }>();

  for (const result of responses) {
    if (result.status === 'fulfilled' && result.value.exists) {
      const { original, variant, type } = result.value;
      const priority = type === 'webm' ? 1 : 2; // WebM has higher priority

      const existing = availableVariants.get(original);
      if (!existing || priority < existing.priority) {
        availableVariants.set(original, { url: variant, priority });
      }
    }
  }

  // Build final results
  for (const url of urls) {
    const variant = availableVariants.get(url);
    results.set(url, variant?.url || url);
  }

  console.log('[FormatSelector] Batch selection:', Object.fromEntries(results));

  return results;
}

/**
 * Get format info for debugging
 */
export function getFormatInfo(url: string): {
  format: string;
  codec: string;
  optimized: boolean;
  savings: string;
} {
  if (url.includes('.av1.mp4')) {
    return { format: 'MP4', codec: 'AV1', optimized: true, savings: '-50%' };
  }
  if (url.endsWith('.webm')) {
    return { format: 'WebM', codec: 'VP9', optimized: true, savings: '-30%' };
  }
  if (url.includes('_opt.mp4')) {
    return { format: 'MP4', codec: 'H.264 (CRF 28)', optimized: true, savings: '-78%' };
  }
  return { format: 'MP4', codec: 'H.264 (original)', optimized: false, savings: '0%' };
}
