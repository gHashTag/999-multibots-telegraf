/**
 * TikTok-style Captions Component for Remotion
 *
 * Style based on reel_01.mp4:
 * - Bright yellow #FFFF00
 * - UPPERCASE, bold (NOT italic)
 * - NO background, thin black outline
 * - 1-2 words at a time
 * - Dynamic position based on layout mode
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  delayRender,
  continueRender,
} from 'remotion';
import { CAPTION_DEFAULTS } from '../constants/captions';
import type { CaptionAnimation } from '../shared/types';

/**
 * Dynamic Google Font loader
 * Loads font via CSS @import from Google Fonts CDN
 */
const loadGoogleFont = (fontId: string, weight: number = 900): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Convert fontId to Google Fonts URL format (e.g., 'OpenSans' -> 'Open+Sans')
    const fontName = fontId.replace(/([A-Z])/g, ' $1').trim().replace(/ /g, '+');

    // Check if already loaded
    const existingLink = document.querySelector(`link[data-font="${fontId}"]`);
    if (existingLink) {
      resolve();
      return;
    }

    // Create link element
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${fontName}:wght@${weight}&display=swap&subset=cyrillic,latin`;
    link.setAttribute('data-font', fontId);

    link.onload = () => resolve();
    link.onerror = () => {
      console.warn(`Failed to load font ${fontId}, falling back to Inter`);
      resolve(); // Resolve anyway, will use fallback
    };

    document.head.appendChild(link);
  });
};

// Our own Caption interface (not from @remotion/captions)
export interface Caption {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs?: number;
  confidence?: number;
}

export interface CaptionsProps {
  /** Array of caption objects with timing info */
  captions: Caption[];
  /** Font size in pixels (default: 56) */
  fontSize?: number;
  /** Text color - main color for captions (default: bright yellow) */
  textColor?: string;
  /** Highlight color for current word - kept for compatibility */
  highlightColor?: string;
  /** Position from top in % (default: 50 = center). Use ~50 for split border, ~50 for fullscreen center */
  topPercent?: number;
  /** Max words to show at once (default: 2) */
  maxWords?: number;
  /** Font family/ID from Google Fonts (e.g., 'Montserrat', 'Roboto') */
  fontFamily?: string;
  /** Font weight (400, 500, 600, 700, 800, 900) */
  fontWeight?: number;
  /** Show text shadow for contrast */
  showShadow?: boolean;
  /** Not used anymore but kept for compatibility */
  combineWithinMs?: number;
  /** Not used anymore but kept for compatibility */
  backgroundColor?: string;
  /** Not used anymore but kept for compatibility */
  position?: 'bottom' | 'center';
  /** Not used anymore but kept for compatibility */
  bottomPercent?: number;
  /** Animation effect for caption appearance */
  animation?: CaptionAnimation;
}

/**
 * reel_01.mp4 style captions - 1-2 words, yellow, bold, dynamic position
 */
export const Captions: React.FC<CaptionsProps> = ({
  captions,
  fontSize = CAPTION_DEFAULTS.fontSize,
  textColor = CAPTION_DEFAULTS.textColor,
  topPercent = 50, // Center by default, overridden by SplitTalkingHead
  maxWords = CAPTION_DEFAULTS.maxWords,
  fontFamily = CAPTION_DEFAULTS.fontFamily, // Default font from @vibee/atoms
  fontWeight = 900, // Default weight (bold)
  showShadow = true, // Show shadow by default
  animation = 'pop', // Default animation
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = (frame / fps) * 1000;

  // Wait for selected font to load before rendering
  const [fontHandle] = useState(() => delayRender(`Loading ${fontFamily} font`));

  useEffect(() => {
    loadGoogleFont(fontFamily, fontWeight)
      .then(() => continueRender(fontHandle))
      .catch((err) => {
        console.error('Font loading failed:', err);
        continueRender(fontHandle);
      });
  }, [fontHandle, fontFamily, fontWeight]);

  // Compute CSS font-family with fallback
  const cssFontFamily = useMemo(() => {
    // Convert fontId to CSS font-family format (e.g., 'OpenSans' -> 'Open Sans')
    const displayName = fontFamily.replace(/([A-Z])/g, ' $1').trim();
    return `"${displayName}", "Inter", sans-serif`;
  }, [fontFamily]);

  // Skip if no captions
  if (!captions || captions.length === 0) {
    return null;
  }

  // Find current word index
  let currentWordIndex = -1;
  for (let i = 0; i < captions.length; i++) {
    const cap = captions[i];
    if (currentTimeMs >= cap.startMs && currentTimeMs < cap.endMs) {
      currentWordIndex = i;
      break;
    }
    // If we're between words, show the previous word briefly
    if (i < captions.length - 1) {
      const nextCap = captions[i + 1];
      if (currentTimeMs >= cap.endMs && currentTimeMs < nextCap.startMs) {
        // Only show if gap is small (< 300ms)
        if (nextCap.startMs - cap.endMs < 300) {
          currentWordIndex = i;
        }
        break;
      }
    }
  }

  // If no current word found
  if (currentWordIndex === -1) {
    // Check if we're before the first caption
    if (captions.length > 0 && currentTimeMs < captions[0].startMs) {
      return null;
    }
    // Check if we're after the last caption
    const lastCaption = captions[captions.length - 1];
    if (currentTimeMs > lastCaption.endMs + 200) {
      return null;
    }
    // Show last word briefly after it ends
    if (currentTimeMs >= lastCaption.startMs) {
      currentWordIndex = captions.length - 1;
    } else {
      return null;
    }
  }

  // Get current word
  const currentCaption = captions[currentWordIndex];

  // Get words to display (1-2 words)
  const visibleWords: Caption[] = [currentCaption];

  // Add next word if it starts soon (within 150ms)
  if (currentWordIndex < captions.length - 1 && maxWords > 1) {
    const nextWord = captions[currentWordIndex + 1];
    if (nextWord.startMs - currentCaption.endMs < 150) {
      visibleWords.push(nextWord);
    }
  }

  // Animation - based on animation prop
  const wordStartFrame = (currentCaption.startMs / 1000) * fps;
  const framesSinceStart = frame - wordStartFrame;

  // Calculate animation values based on animation type
  const getAnimationStyle = (): { transform: string; opacity: number } => {
    switch (animation) {
      case 'fade':
        return {
          transform: 'translateY(-50%)',
          opacity: interpolate(framesSinceStart, [0, 6], [0, 1], { extrapolateRight: 'clamp' }),
        };

      case 'slide':
        const slideProgress = spring({
          frame: framesSinceStart,
          fps,
          config: { damping: 15, stiffness: 150 },
        });
        const slideX = interpolate(slideProgress, [0, 1], [-50, 0]);
        return {
          transform: `translateY(-50%) translateX(${slideX}px)`,
          opacity: interpolate(framesSinceStart, [0, 3], [0, 1], { extrapolateRight: 'clamp' }),
        };

      case 'bounce':
        const bounceScale = spring({
          frame: framesSinceStart,
          fps,
          config: { damping: 8, stiffness: 200, mass: 0.3 },
        });
        return {
          transform: `translateY(-50%) scale(${bounceScale})`,
          opacity: interpolate(framesSinceStart, [0, 2], [0, 1], { extrapolateRight: 'clamp' }),
        };

      case 'scaleRotate':
        const srProgress = spring({
          frame: framesSinceStart,
          fps,
          config: { damping: 10, stiffness: 200, mass: 0.3 },
        });
        const scaleVal = interpolate(srProgress, [0, 1], [0.4, 1]);
        const rotateVal = interpolate(srProgress, [0, 0.5], [15, 0], { extrapolateRight: 'clamp' });
        return {
          transform: `translateY(-50%) scale(${scaleVal}) rotate(${rotateVal}deg)`,
          opacity: interpolate(framesSinceStart, [0, 3], [0, 1], { extrapolateRight: 'clamp' }),
        };

      case 'pop':
      default:
        const popScale = spring({
          frame: framesSinceStart,
          fps,
          config: { damping: 12, stiffness: 180, mass: 0.4 },
        });
        return {
          transform: `translateY(-50%) scale(${popScale})`,
          opacity: interpolate(framesSinceStart, [0, 2], [0, 1], { extrapolateRight: 'clamp' }),
        };
    }
  };

  const animationStyle = getAnimationStyle();

  // Build caption text
  const captionText = visibleWords.map(w => w.text).join(' ').toUpperCase();

  return (
    <AbsoluteFill
      style={{
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: `${topPercent}%`,
          left: 0,
          right: 0,
          transform: animationStyle.transform,
          opacity: animationStyle.opacity,
          display: 'flex',
          justifyContent: 'center',
          padding: '0 20px',
        }}
      >
        <p
          style={{
            fontSize,
            fontFamily: cssFontFamily,
            fontWeight: fontWeight,
            fontStyle: 'normal', // NOT italic - straight like reel_01.mp4
            color: textColor,
            textAlign: 'center',
            margin: 0,
            lineHeight: 1.1,
            // Thin black outline for contrast (like reel_01.mp4)
            textShadow: showShadow
              ? `-1px -1px 0 #000,
                 1px -1px 0 #000,
                 -1px 1px 0 #000,
                 1px 1px 0 #000,
                 -2px -2px 0 #000,
                 2px -2px 0 #000,
                 -2px 2px 0 #000,
                 2px 2px 0 #000`
              : 'none',
            letterSpacing: '0.02em',
          }}
        >
          {captionText}
        </p>
      </div>
    </AbsoluteFill>
  );
};

export default Captions;
