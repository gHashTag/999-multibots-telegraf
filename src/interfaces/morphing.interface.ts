/**
 * Morphing Interface Stub
 */

export interface MorphingConfig {
  sourceImage: string;
  targetImage: string;
  steps: number;
}

export interface MorphingResult {
  videoUrl: string;
  frames: string[];
}
