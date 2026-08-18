/**
 * useAdaptivePremount - Network-aware premount frame calculation
 *
 * Based on TikTok's preloading strategy and MDPI HAS research (2025):
 * - Adapts premount depth based on network quality
 * - Uses Network Information API for detection
 * - Respects battery and data saver modes
 *
 * premountFor values (at 30fps):
 * - 4G/WiFi: 150 frames (5s) - fast network, less buffer needed
 * - 3G: 300 frames (10s) - moderate network
 * - 2G/Slow: 450 frames (15s) - slow network, more buffer
 */

import { useState, useEffect, useCallback } from 'react';

interface NetworkCondition {
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';
  downlink: number; // Mbps
  rtt: number; // ms
  saveData: boolean;
}

interface AdaptivePremountOptions {
  fps?: number;
  minPremount?: number;   // Minimum frames (fast network)
  maxPremount?: number;   // Maximum frames (slow network)
  defaultPremount?: number;
}

// Extend Navigator for Network Information API
interface NavigatorWithConnection extends Navigator {
  connection?: {
    effectiveType: string;
    downlink: number;
    rtt: number;
    saveData: boolean;
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
  };
}

export function useAdaptivePremount(options: AdaptivePremountOptions = {}) {
  const {
    fps = 30,
    minPremount = 150,   // 5 seconds at 30fps
    maxPremount = 450,   // 15 seconds at 30fps
    defaultPremount = 300, // 10 seconds at 30fps
  } = options;

  const [premountFrames, setPremountFrames] = useState(defaultPremount);
  const [networkCondition, setNetworkCondition] = useState<NetworkCondition>({
    effectiveType: 'unknown',
    downlink: 10,
    rtt: 50,
    saveData: false,
  });

  // Calculate optimal premount based on network conditions
  const calculatePremount = useCallback(
    (condition: NetworkCondition): number => {
      // If data saver is on, use minimum (download less)
      if (condition.saveData) {
        return minPremount;
      }

      // Map effective type to premount frames
      switch (condition.effectiveType) {
        case '4g':
          // Fast network: 5 seconds buffer
          return minPremount;

        case '3g':
          // Moderate network: 10 seconds buffer
          return defaultPremount;

        case '2g':
        case 'slow-2g':
          // Slow network: 15 seconds buffer
          return maxPremount;

        default:
          // Fallback: use RTT-based calculation
          if (condition.rtt < 100) {
            return minPremount; // Low latency
          } else if (condition.rtt < 300) {
            return defaultPremount; // Medium latency
          } else {
            return maxPremount; // High latency
          }
      }
    },
    [minPremount, maxPremount, defaultPremount]
  );

  // Update network condition from Network Information API
  const updateNetworkCondition = useCallback(() => {
    const nav = navigator as NavigatorWithConnection;
    const connection = nav.connection;

    if (!connection) {
      // Fallback: estimate from a quick fetch
      estimateNetworkSpeed();
      return;
    }

    const condition: NetworkCondition = {
      effectiveType: connection.effectiveType as NetworkCondition['effectiveType'],
      downlink: connection.downlink || 10,
      rtt: connection.rtt || 50,
      saveData: connection.saveData || false,
    };

    setNetworkCondition(condition);
    setPremountFrames(calculatePremount(condition));
  }, [calculatePremount]);

  // Fallback: estimate network speed with a small fetch
  const estimateNetworkSpeed = useCallback(async () => {
    try {
      const startTime = performance.now();

      // Fetch a small resource to measure RTT
      await fetch('/manifest.json', { cache: 'no-store' });

      const rtt = performance.now() - startTime;

      const condition: NetworkCondition = {
        effectiveType: rtt < 100 ? '4g' : rtt < 300 ? '3g' : '2g',
        downlink: 10,
        rtt,
        saveData: false,
      };

      setNetworkCondition(condition);
      setPremountFrames(calculatePremount(condition));
    } catch {
      // Use default on error
      setPremountFrames(defaultPremount);
    }
  }, [calculatePremount, defaultPremount]);

  // Listen for network changes
  useEffect(() => {
    const nav = navigator as NavigatorWithConnection;
    const connection = nav.connection;

    // Initial update
    updateNetworkCondition();

    // Listen for changes
    if (connection) {
      connection.addEventListener('change', updateNetworkCondition);
      return () => {
        connection.removeEventListener('change', updateNetworkCondition);
      };
    }

    // If no Network Information API, poll occasionally
    const interval = setInterval(estimateNetworkSpeed, 30000); // Every 30s
    return () => clearInterval(interval);
  }, [updateNetworkCondition, estimateNetworkSpeed]);

  // Convert frames to seconds for debugging
  const premountSeconds = premountFrames / fps;

  return {
    premountFrames,
    premountSeconds,
    networkCondition,
    isSlowNetwork: networkCondition.effectiveType === '2g' || networkCondition.effectiveType === 'slow-2g',
    isFastNetwork: networkCondition.effectiveType === '4g',
    isDataSaver: networkCondition.saveData,
  };
}

export default useAdaptivePremount;
