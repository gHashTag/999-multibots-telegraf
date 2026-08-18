/**
 * Content Analyzer - Netflix-style per-title bitrate optimization
 *
 * Research (2025):
 * - Netflix Per-Title Encoding: custom bitrate ladder per video
 * - Simple content = lower bitrate, complex = higher bitrate
 * - 20-30% bitrate reduction vs fixed ladders
 *
 * @see https://netflixtechblog.com/per-title-encode-optimization-7e99442b62a2
 */

export interface BitrateRung {
  height: number;
  bitrate: number;
  label: string;
}

export type ContentComplexity = 'low' | 'medium' | 'high';

export interface AnalysisResult {
  complexity: ContentComplexity;
  edgeDensity: number;
  motionScore: number;
  recommendedLadder: BitrateRung[];
  estimatedSavings: string;
}

/**
 * Predefined bitrate ladders based on content complexity
 * Based on Netflix research
 */
const BITRATE_LADDERS: Record<ContentComplexity, BitrateRung[]> = {
  // Simple content: animations, screencasts, static scenes
  low: [
    { height: 360, bitrate: 400_000, label: '360p' },
    { height: 480, bitrate: 600_000, label: '480p' },
    { height: 720, bitrate: 1_000_000, label: '720p' },
    { height: 1080, bitrate: 2_000_000, label: '1080p' },
  ],
  // Average content: most videos
  medium: [
    { height: 360, bitrate: 600_000, label: '360p' },
    { height: 480, bitrate: 1_000_000, label: '480p' },
    { height: 720, bitrate: 2_500_000, label: '720p' },
    { height: 1080, bitrate: 4_500_000, label: '1080p' },
  ],
  // Complex content: high motion, fine details, film grain
  high: [
    { height: 360, bitrate: 800_000, label: '360p' },
    { height: 480, bitrate: 1_500_000, label: '480p' },
    { height: 720, bitrate: 3_500_000, label: '720p' },
    { height: 1080, bitrate: 6_000_000, label: '1080p' },
  ],
};

/**
 * Calculate edge density (Sobel operator approximation)
 * High edge density = more detail = higher complexity
 */
function calculateEdgeDensity(imageData: ImageData): number {
  const { data, width, height } = imageData;
  let edgeSum = 0;
  let pixelCount = 0;

  // Simple Sobel-like edge detection
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;

      // Get grayscale values for 3x3 neighborhood
      const getGray = (ox: number, oy: number) => {
        const i = ((y + oy) * width + (x + ox)) * 4;
        return (data[i] + data[i + 1] + data[i + 2]) / 3;
      };

      // Sobel X gradient
      const gx =
        -getGray(-1, -1) +
        getGray(1, -1) +
        -2 * getGray(-1, 0) +
        2 * getGray(1, 0) +
        -getGray(-1, 1) +
        getGray(1, 1);

      // Sobel Y gradient
      const gy =
        -getGray(-1, -1) +
        -2 * getGray(0, -1) +
        -getGray(1, -1) +
        getGray(-1, 1) +
        2 * getGray(0, 1) +
        getGray(1, 1);

      // Gradient magnitude
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edgeSum += magnitude;
      pixelCount++;
    }
  }

  // Normalize to 0-1 range
  return Math.min(1, edgeSum / pixelCount / 255);
}

/**
 * Calculate motion score between two frames
 */
function calculateMotionScore(frame1: ImageData, frame2: ImageData): number {
  if (frame1.width !== frame2.width || frame1.height !== frame2.height) {
    return 0;
  }

  let diffSum = 0;
  const len = frame1.data.length;

  for (let i = 0; i < len; i += 4) {
    const r = Math.abs(frame1.data[i] - frame2.data[i]);
    const g = Math.abs(frame1.data[i + 1] - frame2.data[i + 1]);
    const b = Math.abs(frame1.data[i + 2] - frame2.data[i + 2]);
    diffSum += (r + g + b) / 3;
  }

  // Normalize to 0-1 range
  return Math.min(1, (diffSum / (len / 4)) / 128);
}

/**
 * Analyze video content complexity
 * Samples frames and determines optimal bitrate ladder
 */
export async function analyzeVideoComplexity(videoUrl: string): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'metadata';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to create canvas context'));
      return;
    }

    // Sample at 320x180 for speed
    canvas.width = 320;
    canvas.height = 180;

    const edgeSamples: number[] = [];
    const motionSamples: number[] = [];
    let previousFrame: ImageData | null = null;
    let currentSample = 0;
    const totalSamples = 10;

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      const interval = duration / (totalSamples + 1);

      const sampleFrame = async () => {
        if (currentSample >= totalSamples) {
          // Calculate final scores
          const avgEdgeDensity =
            edgeSamples.reduce((a, b) => a + b, 0) / edgeSamples.length;
          const avgMotionScore =
            motionSamples.length > 0
              ? motionSamples.reduce((a, b) => a + b, 0) / motionSamples.length
              : 0;

          // Determine complexity
          const combinedScore = avgEdgeDensity * 0.6 + avgMotionScore * 0.4;
          let complexity: ContentComplexity;
          let estimatedSavings: string;

          if (combinedScore < 0.15) {
            complexity = 'low';
            estimatedSavings = '-30%';
          } else if (combinedScore < 0.35) {
            complexity = 'medium';
            estimatedSavings = '-20%';
          } else {
            complexity = 'high';
            estimatedSavings = '-10%';
          }

          resolve({
            complexity,
            edgeDensity: avgEdgeDensity,
            motionScore: avgMotionScore,
            recommendedLadder: BITRATE_LADDERS[complexity],
            estimatedSavings,
          });

          return;
        }

        // Seek to sample position
        video.currentTime = interval * (currentSample + 1);
      };

      video.onseeked = () => {
        // Draw frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Calculate edge density
        const edgeDensity = calculateEdgeDensity(imageData);
        edgeSamples.push(edgeDensity);

        // Calculate motion (compare to previous frame)
        if (previousFrame) {
          const motionScore = calculateMotionScore(previousFrame, imageData);
          motionSamples.push(motionScore);
        }
        previousFrame = imageData;

        currentSample++;
        sampleFrame();
      };

      // Start sampling
      sampleFrame();
    };

    video.onerror = () => {
      reject(new Error(`Failed to load video: ${videoUrl}`));
    };

    video.src = videoUrl;
    video.load();
  });
}

/**
 * Get recommended quality based on bandwidth and content complexity
 */
export function selectQualityForContent(
  bandwidth: number,
  complexity: ContentComplexity
): BitrateRung {
  const ladder = BITRATE_LADDERS[complexity];

  // Find highest quality that fits bandwidth (with 20% buffer)
  const maxBitrate = bandwidth * 0.8;

  for (let i = ladder.length - 1; i >= 0; i--) {
    if (ladder[i].bitrate <= maxBitrate) {
      return ladder[i];
    }
  }

  // Return lowest quality if nothing fits
  return ladder[0];
}

/**
 * Cache for analyzed videos
 */
const analysisCache = new Map<string, AnalysisResult>();

/**
 * Get or compute video analysis (cached)
 */
export async function getVideoAnalysis(videoUrl: string): Promise<AnalysisResult> {
  const cached = analysisCache.get(videoUrl);
  if (cached) {
    return cached;
  }

  const result = await analyzeVideoComplexity(videoUrl);
  analysisCache.set(videoUrl, result);

  console.log(`[ContentAnalyzer] ${videoUrl}:`, {
    complexity: result.complexity,
    edgeDensity: result.edgeDensity.toFixed(3),
    motionScore: result.motionScore.toFixed(3),
    estimatedSavings: result.estimatedSavings,
  });

  return result;
}

export default analyzeVideoComplexity;
