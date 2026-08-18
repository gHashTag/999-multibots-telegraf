/**
 * BehaviorTracker - ML-based user behavior tracking for predictive prefetch
 *
 * Research (2025):
 * - Cloudflare Speed Brain uses ML to predict navigation
 * - YouTube uses deep learning for hyper-personalization
 * - Predictive prefetch improves cache hit rate by 25%+
 *
 * Strategy:
 * 1. Track viewed segments and durations
 * 2. Build simple probabilistic model
 * 3. Predict next segments based on patterns
 *
 * @see https://www.debugbear.com/blog/cloudflare-speed-brain
 */

interface SegmentView {
  segmentId: string;
  url: string;
  startFrame: number;
  duration: number;
  timestamp: number;
  completed: boolean;
}

interface BehaviorData {
  viewedSegments: SegmentView[];
  avgViewDuration: number;
  skipRate: number;
  sessionCount: number;
  lastSession: number;
}

interface Segment {
  id: string;
  url: string;
  startFrame: number;
  endFrame: number;
}

const STORAGE_KEY = 'vibee-behavior-data';
const MAX_HISTORY = 100;
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

class BehaviorTracker {
  private data: BehaviorData;
  private currentSession: SegmentView[] = [];

  constructor() {
    this.data = this.loadFromStorage();
  }

  /**
   * Track when a segment starts playing
   */
  trackSegmentStart(segment: Segment): void {
    const view: SegmentView = {
      segmentId: segment.id,
      url: segment.url,
      startFrame: segment.startFrame,
      duration: 0,
      timestamp: Date.now(),
      completed: false,
    };

    this.currentSession.push(view);
  }

  /**
   * Track segment view completion
   */
  trackSegmentEnd(segmentId: string, watchedDuration: number, completed: boolean): void {
    const view = this.currentSession.find((v) => v.segmentId === segmentId);
    if (view) {
      view.duration = watchedDuration;
      view.completed = completed;

      // Add to history
      this.data.viewedSegments.push(view);

      // Trim history
      if (this.data.viewedSegments.length > MAX_HISTORY) {
        this.data.viewedSegments = this.data.viewedSegments.slice(-MAX_HISTORY);
      }

      // Update averages
      this.updateStats();
      this.saveToStorage();
    }
  }

  /**
   * Predict next segments based on user behavior
   * Returns segments in priority order
   */
  predictNextSegments(currentFrame: number, segments: Segment[], limit = 3): Segment[] {
    // 1. Sequential prediction (most common pattern)
    const sequential = segments
      .filter((s) => s.startFrame > currentFrame)
      .sort((a, b) => a.startFrame - b.startFrame);

    // 2. Boost priority for segments similar to previously watched
    const watchedUrls = new Set(this.data.viewedSegments.map((v) => v.url));
    const boosted = sequential.map((segment) => ({
      segment,
      score: this.calculateSegmentScore(segment, currentFrame, watchedUrls),
    }));

    // Sort by score (higher = more likely to be watched)
    boosted.sort((a, b) => b.score - a.score);

    return boosted.slice(0, limit).map((b) => b.segment);
  }

  /**
   * Calculate priority score for a segment
   */
  private calculateSegmentScore(
    segment: Segment,
    currentFrame: number,
    watchedUrls: Set<string>
  ): number {
    let score = 100;

    // Factor 1: Proximity (closer = higher score)
    const distance = segment.startFrame - currentFrame;
    score -= distance / 30; // Lose 1 point per second away

    // Factor 2: Previously watched similar content (boost)
    if (watchedUrls.has(segment.url)) {
      score += 20;
    }

    // Factor 3: User's typical view duration
    // If user usually watches short segments, prioritize those
    const avgDuration = this.data.avgViewDuration || 5000;
    const segmentDuration = (segment.endFrame - segment.startFrame) / 30 * 1000;
    if (segmentDuration <= avgDuration * 1.5) {
      score += 10;
    }

    // Factor 4: Skip rate penalty
    // If user often skips, prioritize shorter segments
    if (this.data.skipRate > 0.3) {
      score -= segmentDuration / 1000;
    }

    return Math.max(0, score);
  }

  /**
   * Update running statistics
   */
  private updateStats(): void {
    const views = this.data.viewedSegments;

    if (views.length === 0) return;

    // Average view duration
    const totalDuration = views.reduce((sum, v) => sum + v.duration, 0);
    this.data.avgViewDuration = totalDuration / views.length;

    // Skip rate (incomplete views)
    const skipped = views.filter((v) => !v.completed).length;
    this.data.skipRate = skipped / views.length;

    // Session tracking
    const now = Date.now();
    if (now - this.data.lastSession > SESSION_TIMEOUT) {
      this.data.sessionCount++;
    }
    this.data.lastSession = now;
  }

  /**
   * Get prefetch URLs in priority order
   */
  getPrefetchPriority(currentFrame: number, segments: Segment[]): string[] {
    const predicted = this.predictNextSegments(currentFrame, segments, 5);
    return predicted.map((s) => s.url);
  }

  /**
   * Get analytics data
   */
  getAnalytics(): {
    avgViewDuration: number;
    skipRate: number;
    sessionCount: number;
    totalViews: number;
  } {
    return {
      avgViewDuration: this.data.avgViewDuration,
      skipRate: this.data.skipRate,
      sessionCount: this.data.sessionCount,
      totalViews: this.data.viewedSegments.length,
    };
  }

  /**
   * Load data from localStorage
   */
  private loadFromStorage(): BehaviorData {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Ignore parse errors
    }

    return {
      viewedSegments: [],
      avgViewDuration: 5000,
      skipRate: 0,
      sessionCount: 1,
      lastSession: Date.now(),
    };
  }

  /**
   * Save data to localStorage
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or disabled
    }
  }

  /**
   * Clear all tracking data
   */
  clear(): void {
    this.data = {
      viewedSegments: [],
      avgViewDuration: 5000,
      skipRate: 0,
      sessionCount: 1,
      lastSession: Date.now(),
    };
    this.currentSession = [];
    localStorage.removeItem(STORAGE_KEY);
  }
}

// Singleton instance
export const behaviorTracker = new BehaviorTracker();

export default behaviorTracker;
