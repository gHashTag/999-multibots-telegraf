/**
 * Buffer-Based Adaptation (BBA) Algorithm
 *
 * Generated from: specs/video-bba.vibee
 * Based on: Stanford Research "A Buffer-Based Approach to Rate Adaptation"
 * SIGCOMM 2014 - Huang et al.
 * Result: 10-20% rebuffer reduction
 */

import Hls from 'hls.js';

// ============================================================================
// Types (from spec)
// ============================================================================

export interface BBAConfig {
  reservoir: number;          // Buffer threshold for min bitrate (seconds, default: 10)
  cushion: number;            // Buffer threshold for max bitrate (seconds, default: 30)
  maxBuffer: number;          // Maximum buffer size (seconds, default: 60)
  minSwitchInterval: number;  // Minimum time between switches (ms, default: 5000)
  startupThreshold: number;   // Buffer level to exit startup (seconds, default: 10)
  enableOscillationGuard: boolean;  // Prevent rapid quality changes (default: true)
}

export interface BBAState {
  currentBuffer: number;      // Current buffer level in seconds
  currentBitrate: number;     // Current selected bitrate in kbps
  lastThroughput: number;     // Last measured throughput in kbps
  avgThroughput: number;      // EWMA of throughput
  lastSwitchTime: number;     // Timestamp of last quality switch
  isStartup: boolean;         // Whether in startup phase
  switchCount: number;        // Number of switches in session
}

export interface BitrateDecision {
  selectedBitrate: number;    // Selected bitrate in kbps
  selectedIndex: number;      // Index in available bitrates array
  reason: string;             // Reason for selection
  confidence: number;         // 0-1 confidence score
}

export interface QualityLevel {
  index: number;
  bitrate: number;            // kbps
  width: number;
  height: number;
  label: string;              // e.g., "720p", "1080p"
}

export interface ThroughputSample {
  timestamp: number;
  bytesLoaded: number;
  duration: number;
  throughput: number;         // kbps
}

// ============================================================================
// Default Configuration
// ============================================================================

export function createDefaultConfig(): BBAConfig {
  return {
    reservoir: 10,            // 10 seconds minimum buffer
    cushion: 30,              // 30 seconds target buffer
    maxBuffer: 60,            // 60 seconds maximum buffer
    minSwitchInterval: 5000,  // 5 seconds between switches
    startupThreshold: 10,     // Exit startup after 10 seconds buffer
    enableOscillationGuard: true,
  };
}

/**
 * Create initial BBA state
 */
export function createInitialState(): BBAState {
  return {
    currentBuffer: 0,
    currentBitrate: 0,
    lastThroughput: 0,
    avgThroughput: 0,
    lastSwitchTime: 0,
    isStartup: true,
    switchCount: 0,
  };
}

// ============================================================================
// Core BBA Algorithm (from spec)
// ============================================================================

/**
 * Main BBA algorithm - select bitrate based on buffer level
 *
 * Algorithm:
 * - If buffer < reservoir: select minimum bitrate
 * - If buffer > cushion: select maximum bitrate
 * - Otherwise: linear interpolation between min and max
 */
export function selectBitrate(
  config: BBAConfig,
  state: BBAState,
  availableLevels: QualityLevel[]
): BitrateDecision {
  if (availableLevels.length === 0) {
    return {
      selectedBitrate: 0,
      selectedIndex: 0,
      reason: 'no_levels_available',
      confidence: 0,
    };
  }

  // Sort levels by bitrate (ascending)
  const sortedLevels = [...availableLevels].sort((a, b) => a.bitrate - b.bitrate);
  const minBitrate = sortedLevels[0].bitrate;
  const maxBitrate = sortedLevels[sortedLevels.length - 1].bitrate;

  const { currentBuffer } = state;
  const { reservoir, cushion } = config;

  let selectedBitrate: number;
  let reason: string;
  let confidence: number;

  // Startup phase: use minimum bitrate to build buffer quickly
  if (state.isStartup) {
    selectedBitrate = minBitrate;
    reason = 'startup_phase';
    confidence = 1.0;
  }
  // Buffer below reservoir: use minimum bitrate
  else if (currentBuffer < reservoir) {
    selectedBitrate = minBitrate;
    reason = 'buffer_below_reservoir';
    confidence = 1.0;
  }
  // Buffer above cushion: use maximum bitrate
  else if (currentBuffer > cushion) {
    selectedBitrate = maxBitrate;
    reason = 'buffer_above_cushion';
    confidence = 1.0;
  }
  // Linear interpolation between reservoir and cushion
  else {
    const ratio = (currentBuffer - reservoir) / (cushion - reservoir);
    const bitrateRange = maxBitrate - minBitrate;
    const targetBitrate = minBitrate + ratio * bitrateRange;

    // Find closest available bitrate
    selectedBitrate = sortedLevels.reduce((prev, curr) =>
      Math.abs(curr.bitrate - targetBitrate) < Math.abs(prev.bitrate - targetBitrate)
        ? curr
        : prev
    ).bitrate;

    reason = 'linear_interpolation';
    confidence = 0.8 + ratio * 0.2; // Higher confidence at higher buffer
  }

  // Find the index of selected bitrate
  const selectedIndex = availableLevels.findIndex((l) => l.bitrate === selectedBitrate);

  return {
    selectedBitrate,
    selectedIndex: selectedIndex >= 0 ? selectedIndex : 0,
    reason,
    confidence,
  };
}

/**
 * Check if quality switch should happen (oscillation guard)
 */
export function shouldSwitch(
  current: QualityLevel,
  recommended: QualityLevel,
  state: BBAState,
  config: BBAConfig
): boolean {
  // Same quality - no switch needed
  if (current.bitrate === recommended.bitrate) {
    return false;
  }

  // Oscillation guard: prevent rapid switches
  if (config.enableOscillationGuard) {
    const timeSinceLastSwitch = performance.now() - state.lastSwitchTime;
    if (timeSinceLastSwitch < config.minSwitchInterval) {
      console.log('[BBA] Switch blocked by oscillation guard:', timeSinceLastSwitch, 'ms');
      return false;
    }
  }

  // Always allow downgrade if buffer is critical
  if (state.currentBuffer < config.reservoir / 2 && recommended.bitrate < current.bitrate) {
    return true;
  }

  // Allow upgrade if buffer is healthy
  if (state.currentBuffer > config.cushion * 0.8 && recommended.bitrate > current.bitrate) {
    return true;
  }

  // Default: allow switch if interval passed
  return true;
}

/**
 * Update throughput estimate using EWMA
 */
export function updateThroughput(state: BBAState, sample: ThroughputSample): BBAState {
  const alpha = 0.3; // EWMA smoothing factor

  const newAvgThroughput =
    state.avgThroughput === 0
      ? sample.throughput
      : alpha * sample.throughput + (1 - alpha) * state.avgThroughput;

  return {
    ...state,
    lastThroughput: sample.throughput,
    avgThroughput: newAvgThroughput,
  };
}

/**
 * Dynamically adjust reservoir/cushion based on network conditions
 */
export function adjustThresholds(config: BBAConfig, throughputRatio: number): BBAConfig {
  // throughputRatio = current / previous
  // If throughput dropped significantly, be more conservative

  if (throughputRatio < 0.5) {
    // Throughput dropped by more than 50%
    return {
      ...config,
      reservoir: Math.min(config.reservoir * 1.5, config.maxBuffer * 0.3),
      cushion: Math.min(config.cushion * 1.2, config.maxBuffer * 0.8),
    };
  } else if (throughputRatio > 1.5) {
    // Throughput increased by more than 50%
    return {
      ...config,
      reservoir: Math.max(config.reservoir * 0.8, 5),
      cushion: Math.max(config.cushion * 0.9, 15),
    };
  }

  return config;
}

/**
 * Transition from startup to steady-state mode
 */
export function exitStartupPhase(state: BBAState, config: BBAConfig): BBAState {
  if (!state.isStartup) {
    return state;
  }

  if (state.currentBuffer >= config.startupThreshold) {
    console.log('[BBA] Exiting startup phase, buffer:', state.currentBuffer, 's');
    return {
      ...state,
      isStartup: false,
    };
  }

  return state;
}

// ============================================================================
// HLS.js Integration
// ============================================================================

/**
 * Custom ABR controller for HLS.js using BBA algorithm
 */
export class BBAController {
  private hls: Hls;
  private config: BBAConfig;
  private state: BBAState;
  private levels: QualityLevel[];

  constructor(hls: Hls, config: Partial<BBAConfig> = {}) {
    this.hls = hls;
    this.config = { ...createDefaultConfig(), ...config };
    this.state = createInitialState();
    this.levels = [];

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Track available quality levels
    this.hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      this.levels = data.levels.map((level, index) => ({
        index,
        bitrate: level.bitrate / 1000, // Convert to kbps
        width: level.width,
        height: level.height,
        label: `${level.height}p`,
      }));
      console.log('[BBA] Levels loaded:', this.levels.length);
    });

    // Track buffer level changes
    this.hls.on(Hls.Events.BUFFER_APPENDING, () => {
      if (this.hls.media) {
        const buffered = this.hls.media.buffered;
        if (buffered.length > 0) {
          this.state.currentBuffer = buffered.end(buffered.length - 1) - this.hls.media.currentTime;
          this.state = exitStartupPhase(this.state, this.config);
        }
      }
    });

    // Track fragment loading for throughput estimation
    this.hls.on(Hls.Events.FRAG_LOADED, (_, data) => {
      const sample: ThroughputSample = {
        timestamp: performance.now(),
        bytesLoaded: data.frag.stats.loaded,
        duration: data.frag.stats.loading.end - data.frag.stats.loading.start,
        throughput: (data.frag.stats.loaded * 8) / (data.frag.stats.loading.end - data.frag.stats.loading.start),
      };
      this.state = updateThroughput(this.state, sample);
    });

    // Override level selection
    this.hls.on(Hls.Events.LEVEL_SWITCHING, (_, data) => {
      const currentLevel = this.levels[data.level];
      if (currentLevel) {
        this.state.currentBitrate = currentLevel.bitrate;
        this.state.lastSwitchTime = performance.now();
        this.state.switchCount++;
      }
    });
  }

  /**
   * Get recommended quality level index
   */
  public getRecommendedLevel(): number {
    if (this.levels.length === 0) {
      return -1; // Auto
    }

    const decision = selectBitrate(this.config, this.state, this.levels);
    const currentLevel = this.levels[this.hls.currentLevel] || this.levels[0];

    if (shouldSwitch(currentLevel, this.levels[decision.selectedIndex], this.state, this.config)) {
      console.log('[BBA] Recommending level:', decision.selectedIndex, decision.reason);
      return decision.selectedIndex;
    }

    return this.hls.currentLevel;
  }

  /**
   * Update buffer level manually
   */
  public updateBufferLevel(bufferLevel: number): void {
    this.state.currentBuffer = bufferLevel;
    this.state = exitStartupPhase(this.state, this.config);
  }

  /**
   * Get current state for debugging
   */
  public getState(): BBAState {
    return { ...this.state };
  }

  /**
   * Get current config
   */
  public getConfig(): BBAConfig {
    return { ...this.config };
  }

  /**
   * Destroy controller
   */
  public destroy(): void {
    // HLS.js will automatically remove listeners when destroyed
  }
}

/**
 * Integrate BBA with HLS.js instance
 */
export function integrateWithHLS(hls: Hls, config?: Partial<BBAConfig>): BBAController {
  const controller = new BBAController(hls, config);

  // Use HLS.js ABR controller callback for reliable integration
  // This is more reliable than property descriptor override
  hls.on(Hls.Events.FRAG_LOADING, () => {
    const recommended = controller.getRecommendedLevel();
    if (recommended >= 0 && hls.autoLevelEnabled) {
      // Set next level hint for ABR controller
      hls.nextAutoLevel = recommended;
    }
  });

  // Expose BBA state to window for E2E testing and debugging
  if (typeof window !== 'undefined') {
    (window as any).__BBA_CONTROLLER__ = controller;
    (window as any).__BBA_STATE__ = controller.getState();
    (window as any).__BBA_CONFIG__ = controller.getConfig();

    // Update state periodically
    const updateInterval = setInterval(() => {
      if (controller) {
        (window as any).__BBA_STATE__ = controller.getState();
      }
    }, 1000);

    // Cleanup on HLS destroy
    hls.on(Hls.Events.DESTROYING, () => {
      clearInterval(updateInterval);
      delete (window as any).__BBA_CONTROLLER__;
      delete (window as any).__BBA_STATE__;
      delete (window as any).__BBA_CONFIG__;
    });
  }

  // Expose HLS state for E2E testing
  if (typeof window !== 'undefined') {
    hls.on(Hls.Events.BUFFER_APPENDING, () => {
      const media = hls.media;
      if (media) {
        const buffered = media.buffered;
        (window as any).__HLS_STATE__ = {
          bufferLength: buffered.length > 0 ? buffered.end(buffered.length - 1) - media.currentTime : 0,
          currentLevel: hls.currentLevel,
          levels: hls.levels?.length || 0,
          autoLevelEnabled: hls.autoLevelEnabled,
          nextAutoLevel: hls.nextAutoLevel,
        };
      }
    });
  }

  console.log('[BBA] Integrated with HLS.js (event-based)');
  return controller;
}

export default {
  createDefaultConfig,
  createInitialState,
  selectBitrate,
  shouldSwitch,
  updateThroughput,
  adjustThresholds,
  exitStartupPhase,
  BBAController,
  integrateWithHLS,
};
