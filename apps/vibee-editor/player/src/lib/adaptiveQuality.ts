/**
 * AdaptiveQuality - Bandwidth-aware video quality selection
 *
 * Based on scientific ABR research:
 * - GreenABR+ (2024): Energy-aware quality selection
 * - PLL-ABR (2025): DRL-based segment selection
 * - SODA (Amazon): Smoothness optimization
 *
 * Selects optimal video quality based on:
 * - Predicted bandwidth (EWMA)
 * - Buffer health
 * - Device capabilities
 * - QoE metrics
 *
 * Quality Levels:
 * - 360p: ~500 Kbps - Low bandwidth/mobile
 * - 720p: ~1500 Kbps - Standard quality
 * - 1080p: ~4000 Kbps - High quality
 */

import { BandwidthPredictor, getGlobalBandwidthPredictor } from './bandwidthPredictor';
import type { BandwidthStats } from './bandwidthPredictor';

export type Resolution = '360p' | '720p' | '1080p';

export interface QualityLevel {
  resolution: Resolution;
  url: string;
  bitrate: number; // Kbps
  width: number;
  height: number;
}

export interface QualityManifest {
  [videoId: string]: {
    [key in Resolution]?: QualityLevel;
  };
}

export interface AdaptiveQualityOptions {
  safetyMargin?: number;        // Conservative factor (0.8 = 80%)
  bufferThreshold?: number;     // Seconds of buffer before downgrading
  minBufferForUpgrade?: number; // Seconds of buffer required to upgrade
  switchCooldown?: number;      // Minimum ms between quality switches
  preferHighQuality?: boolean;  // Bias toward higher quality
}

export interface QualityDecision {
  selectedQuality: QualityLevel | null;
  reason: string;
  candidatesConsidered: number;
  predictedBandwidth: number;
  selectedBitrate: number;
}

// Standard quality levels (bitrates in Kbps)
export const STANDARD_QUALITIES: Record<Resolution, { bitrate: number; width: number; height: number }> = {
  '360p': { bitrate: 500, width: 640, height: 360 },
  '720p': { bitrate: 1500, width: 1280, height: 720 },
  '1080p': { bitrate: 4000, width: 1920, height: 1080 },
};

export class AdaptiveQualitySelector {
  private predictor: BandwidthPredictor;
  private lastSwitchTime: number = 0;
  private currentQuality: Resolution = '720p';

  private readonly safetyMargin: number;
  private readonly bufferThreshold: number;
  private readonly minBufferForUpgrade: number;
  private readonly switchCooldown: number;
  private readonly preferHighQuality: boolean;

  constructor(
    options: AdaptiveQualityOptions = {},
    predictor?: BandwidthPredictor
  ) {
    this.safetyMargin = options.safetyMargin ?? 0.8;
    this.bufferThreshold = options.bufferThreshold ?? 2;
    this.minBufferForUpgrade = options.minBufferForUpgrade ?? 4;
    this.switchCooldown = options.switchCooldown ?? 3000; // 3 seconds
    this.preferHighQuality = options.preferHighQuality ?? true;
    this.predictor = predictor ?? getGlobalBandwidthPredictor();
  }

  /**
   * Select optimal quality from available options
   * Based on BBA (Buffer-Based Approach) from Stanford SIGCOMM 2014
   */
  selectQuality(
    qualities: QualityLevel[],
    bufferSeconds: number = 4
  ): QualityDecision {
    if (!qualities || qualities.length === 0) {
      return {
        selectedQuality: null,
        reason: 'No qualities available',
        candidatesConsidered: 0,
        predictedBandwidth: 0,
        selectedBitrate: 0,
      };
    }

    // Sort by bitrate (highest first)
    const sortedQualities = [...qualities].sort((a, b) => b.bitrate - a.bitrate);

    // Get bandwidth prediction
    const stats = this.predictor.getStats();
    const predictedBandwidth = this.predictor.predict();

    // Calculate safe bitrate target
    const safeBitrate = predictedBandwidth * this.safetyMargin;

    // Check if we should enforce cooldown
    const now = Date.now();
    const cooldownActive = (now - this.lastSwitchTime) < this.switchCooldown;

    // Find highest quality that fits within bandwidth
    let selectedQuality = sortedQualities[sortedQualities.length - 1]; // Start with lowest
    let reason = 'Default to lowest quality';

    for (const quality of sortedQualities) {
      if (quality.bitrate <= safeBitrate) {
        selectedQuality = quality;
        reason = `Bitrate ${quality.bitrate} Kbps fits within ${Math.round(safeBitrate)} Kbps safe bandwidth`;
        break;
      }
    }

    // Buffer-based adjustments (BBA algorithm)
    if (bufferSeconds < this.bufferThreshold) {
      // Low buffer - drop quality immediately
      const lowerQuality = sortedQualities.find((q) => q.bitrate < selectedQuality.bitrate);
      if (lowerQuality) {
        selectedQuality = lowerQuality;
        reason = `Low buffer (${bufferSeconds.toFixed(1)}s) - downgrading to ${lowerQuality.resolution}`;
      }
    } else if (bufferSeconds > this.minBufferForUpgrade && !cooldownActive) {
      // High buffer - consider upgrading
      const higherQuality = sortedQualities.find(
        (q) => q.bitrate > selectedQuality.bitrate && q.bitrate <= safeBitrate * 1.2
      );
      if (higherQuality && this.preferHighQuality) {
        selectedQuality = higherQuality;
        reason = `High buffer (${bufferSeconds.toFixed(1)}s) - upgrading to ${higherQuality.resolution}`;
      }
    }

    // Stability check - avoid switching on unstable connection
    if (!stats.isStable && cooldownActive) {
      reason += ' (switch delayed due to unstable connection)';
    }

    // Update state
    if (selectedQuality.resolution !== this.currentQuality) {
      this.lastSwitchTime = now;
      this.currentQuality = selectedQuality.resolution;
    }

    return {
      selectedQuality,
      reason,
      candidatesConsidered: qualities.length,
      predictedBandwidth: Math.round(predictedBandwidth),
      selectedBitrate: selectedQuality.bitrate,
    };
  }

  /**
   * Get quality for a specific video from manifest
   */
  getVideoQuality(
    manifest: QualityManifest,
    videoId: string,
    bufferSeconds: number = 4
  ): QualityDecision {
    const videoQualities = manifest[videoId];
    if (!videoQualities) {
      return {
        selectedQuality: null,
        reason: `Video ${videoId} not found in manifest`,
        candidatesConsidered: 0,
        predictedBandwidth: 0,
        selectedBitrate: 0,
      };
    }

    const qualities: QualityLevel[] = Object.entries(videoQualities)
      .filter(([_, level]) => level !== undefined)
      .map(([resolution, level]) => ({
        ...level!,
        // Ключ манифеста — источник правды о разрешении, поэтому он ПОСЛЕ
        // распаковки. Стоял до — и собственное поле `resolution` внутри
        // уровня молча перекрывало его: явно написанная строка не делала
        // ничего, а выбор качества шёл по значению из тела уровня.
        resolution: resolution as Resolution,
      }));

    return this.selectQuality(qualities, bufferSeconds);
  }

  /**
   * Quick quality selection without buffer consideration
   * Useful for initial quality decision
   */
  getInitialQuality(qualities: QualityLevel[]): QualityLevel | null {
    const decision = this.selectQuality(qualities, 4); // Assume 4s buffer
    return decision.selectedQuality;
  }

  /**
   * Get current quality level
   */
  getCurrentQuality(): Resolution {
    return this.currentQuality;
  }

  /**
   * Force quality level (for user preference)
   */
  setPreferredQuality(resolution: Resolution): void {
    this.currentQuality = resolution;
    this.lastSwitchTime = Date.now();
  }

  /**
   * Get bandwidth stats
   */
  getBandwidthStats(): BandwidthStats {
    return this.predictor.getStats();
  }

  /**
   * Build URL for multi-quality video
   * Convention: video.mp4 → video_720p.mp4
   */
  static buildQualityUrl(baseUrl: string, resolution: Resolution): string {
    const ext = baseUrl.substring(baseUrl.lastIndexOf('.'));
    const base = baseUrl.substring(0, baseUrl.lastIndexOf('.'));
    return `${base}_${resolution}${ext}`;
  }

  /**
   * Create manifest entry from base URL
   */
  static createManifestEntry(
    baseUrl: string,
    videoId: string
  ): QualityManifest {
    return {
      [videoId]: {
        '360p': {
          resolution: '360p',
          url: this.buildQualityUrl(baseUrl, '360p'),
          ...STANDARD_QUALITIES['360p'],
        },
        '720p': {
          resolution: '720p',
          url: this.buildQualityUrl(baseUrl, '720p'),
          ...STANDARD_QUALITIES['720p'],
        },
        '1080p': {
          resolution: '1080p',
          url: baseUrl, // Original is 1080p
          ...STANDARD_QUALITIES['1080p'],
        },
      },
    };
  }
}

// Singleton instance
let globalSelector: AdaptiveQualitySelector | null = null;

export function getGlobalQualitySelector(): AdaptiveQualitySelector {
  if (!globalSelector) {
    globalSelector = new AdaptiveQualitySelector();
  }
  return globalSelector;
}

export default AdaptiveQualitySelector;
