/**
 * Hook Style Animations
 *
 * 7 different opening hook animations for the first 3 seconds of Reels.
 * These pattern-interrupt styles are designed to capture attention immediately.
 */

import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  spring,
  Easing,
} from 'remotion';
import type { HookStyle, HookConfig } from '../types';

// ============================================================
// Hook Style Configuration
// ============================================================

interface HookStyleConfig {
  name: string;
  description: string;
  /** Recommended duration in seconds */
  recommendedDuration: number;
}

export const HOOK_STYLES: Record<HookStyle, HookStyleConfig> = {
  'zoom-impact': {
    name: 'Zoom Impact',
    description: 'Fast zoom to text with impact effect',
    recommendedDuration: 2,
  },
  'slide-reveal': {
    name: 'Slide Reveal',
    description: 'Text slides in from the side',
    recommendedDuration: 2.5,
  },
  'typewriter': {
    name: 'Typewriter',
    description: 'Character-by-character text reveal',
    recommendedDuration: 3,
  },
  'glitch': {
    name: 'Glitch',
    description: 'Glitch effect with color separation',
    recommendedDuration: 2,
  },
  'pulse': {
    name: 'Pulse',
    description: 'Pulsing text entrance with glow',
    recommendedDuration: 2,
  },
  'question': {
    name: 'Question',
    description: 'Question mark animation that resolves to text',
    recommendedDuration: 2.5,
  },
  'counter': {
    name: 'Counter',
    description: 'Countdown or counter animation',
    recommendedDuration: 3,
  },
  'none': {
    name: 'None',
    description: 'No hook animation, direct start',
    recommendedDuration: 0,
  },
};

// ============================================================
// Hook Renderer Props
// ============================================================

interface HookRendererProps {
  style: HookStyle;
  text?: string;
  textColor?: string;
  backgroundColor?: string;
  fontSize?: number;
  /** Duration in frames */
  durationFrames: number;
}

// ============================================================
// Main Hook Renderer Component
// ============================================================

export const HookRenderer: React.FC<HookRendererProps> = ({
  style,
  text = '',
  textColor = '#ffffff',
  backgroundColor = 'transparent',
  fontSize = 72,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (style === 'none' || !text) {
    return null;
  }

  const progress = frame / durationFrames;

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 60,
      }}
    >
      {renderHookStyle(style, {
        text,
        textColor,
        fontSize,
        frame,
        fps,
        durationFrames,
        progress,
      })}
    </AbsoluteFill>
  );
};

// ============================================================
// Style-Specific Renderers
// ============================================================

interface RenderContext {
  text: string;
  textColor: string;
  fontSize: number;
  frame: number;
  fps: number;
  durationFrames: number;
  progress: number;
}

function renderHookStyle(style: HookStyle, ctx: RenderContext): React.ReactNode {
  switch (style) {
    case 'zoom-impact':
      return <ZoomImpactHook {...ctx} />;
    case 'slide-reveal':
      return <SlideRevealHook {...ctx} />;
    case 'typewriter':
      return <TypewriterHook {...ctx} />;
    case 'glitch':
      return <GlitchHook {...ctx} />;
    case 'pulse':
      return <PulseHook {...ctx} />;
    case 'question':
      return <QuestionHook {...ctx} />;
    case 'counter':
      return <CounterHook {...ctx} />;
    default:
      return null;
  }
}

// ============================================================
// Zoom Impact Hook
// ============================================================

const ZoomImpactHook: React.FC<RenderContext> = ({
  text,
  textColor,
  fontSize,
  frame,
  fps,
  durationFrames,
}) => {
  // Scale from 0.1 to 1 with overshoot
  const scale = spring({
    frame,
    fps,
    config: {
      damping: 12,
      stiffness: 100,
      mass: 0.5,
    },
  });

  // Slight rotation wobble
  const rotation = interpolate(frame, [0, 10, 20], [0, -3, 0], {
    extrapolateRight: 'clamp',
  });

  // Fade out at the end
  const opacity = interpolate(
    frame,
    [durationFrames - 15, durationFrames],
    [1, 0],
    { extrapolateLeft: 'clamp' }
  );

  return (
    <div
      style={{
        transform: `scale(${scale}) rotate(${rotation}deg)`,
        opacity,
        textAlign: 'center',
      }}
    >
      <span
        style={{
          fontSize,
          fontWeight: 'bold',
          color: textColor,
          textShadow: `
            0 0 30px ${textColor}60,
            0 0 60px ${textColor}30,
            0 4px 20px rgba(0,0,0,0.8)
          `,
        }}
      >
        {text}
      </span>
    </div>
  );
};

// ============================================================
// Slide Reveal Hook
// ============================================================

const SlideRevealHook: React.FC<RenderContext> = ({
  text,
  textColor,
  fontSize,
  frame,
  fps,
  durationFrames,
}) => {
  const slideIn = spring({
    frame,
    fps,
    config: {
      damping: 20,
      stiffness: 80,
    },
  });

  const translateX = interpolate(slideIn, [0, 1], [-500, 0]);

  // Mask reveal effect
  const maskProgress = interpolate(frame, [0, fps * 0.8], [0, 100], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const opacity = interpolate(
    frame,
    [durationFrames - 15, durationFrames],
    [1, 0],
    { extrapolateLeft: 'clamp' }
  );

  return (
    <div
      style={{
        transform: `translateX(${translateX}px)`,
        opacity,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          clipPath: `inset(0 ${100 - maskProgress}% 0 0)`,
        }}
      >
        <span
          style={{
            fontSize,
            fontWeight: 'bold',
            color: textColor,
            whiteSpace: 'nowrap',
          }}
        >
          {text}
        </span>
      </div>
    </div>
  );
};

// ============================================================
// Typewriter Hook
// ============================================================

const TypewriterHook: React.FC<RenderContext> = ({
  text,
  textColor,
  fontSize,
  frame,
  fps,
  durationFrames,
}) => {
  const charsPerSecond = text.length / ((durationFrames / fps) * 0.7); // 70% of duration for typing
  const visibleChars = Math.floor(frame * (charsPerSecond / fps));
  const displayText = text.slice(0, Math.min(visibleChars, text.length));

  // Blinking cursor
  const showCursor = frame % 15 < 10 && visibleChars <= text.length;

  const opacity = interpolate(
    frame,
    [durationFrames - 15, durationFrames],
    [1, 0],
    { extrapolateLeft: 'clamp' }
  );

  return (
    <div style={{ opacity, textAlign: 'center' }}>
      <span
        style={{
          fontSize,
          fontWeight: 'bold',
          color: textColor,
          fontFamily: 'monospace',
        }}
      >
        {displayText}
        {showCursor && (
          <span
            style={{
              backgroundColor: textColor,
              width: fontSize * 0.5,
              height: fontSize * 1.1,
              display: 'inline-block',
              marginLeft: 4,
              verticalAlign: 'text-bottom',
            }}
          />
        )}
      </span>
    </div>
  );
};

// ============================================================
// Glitch Hook
// ============================================================

const GlitchHook: React.FC<RenderContext> = ({
  text,
  textColor,
  fontSize,
  frame,
  fps,
  durationFrames,
}) => {
  // Random glitch offsets
  const glitchIntensity = frame < fps * 0.5 ? 1 : interpolate(frame, [fps * 0.5, fps], [1, 0]);

  const redOffset = Math.sin(frame * 0.5) * 5 * glitchIntensity;
  const blueOffset = Math.cos(frame * 0.7) * 5 * glitchIntensity;

  // Occasional flicker
  const flicker = frame % 7 === 0 ? 0.7 : 1;

  const opacity = interpolate(
    frame,
    [durationFrames - 15, durationFrames],
    [1, 0],
    { extrapolateLeft: 'clamp' }
  );

  return (
    <div style={{ position: 'relative', opacity: opacity * flicker }}>
      {/* Red channel */}
      <span
        style={{
          position: 'absolute',
          fontSize,
          fontWeight: 'bold',
          color: '#ff0000',
          opacity: 0.5,
          transform: `translate(${redOffset}px, ${-redOffset * 0.5}px)`,
          mixBlendMode: 'screen',
        }}
      >
        {text}
      </span>

      {/* Blue channel */}
      <span
        style={{
          position: 'absolute',
          fontSize,
          fontWeight: 'bold',
          color: '#0000ff',
          opacity: 0.5,
          transform: `translate(${blueOffset}px, ${blueOffset * 0.5}px)`,
          mixBlendMode: 'screen',
        }}
      >
        {text}
      </span>

      {/* Main text */}
      <span
        style={{
          fontSize,
          fontWeight: 'bold',
          color: textColor,
          position: 'relative',
        }}
      >
        {text}
      </span>
    </div>
  );
};

// ============================================================
// Pulse Hook
// ============================================================

const PulseHook: React.FC<RenderContext> = ({
  text,
  textColor,
  fontSize,
  frame,
  fps,
  durationFrames,
}) => {
  // Pulsing scale
  const pulseScale = 1 + Math.sin(frame * 0.2) * 0.05;

  // Glow intensity
  const glowIntensity = 20 + Math.sin(frame * 0.3) * 10;

  // Initial spring entrance
  const entrance = spring({
    frame,
    fps,
    config: {
      damping: 15,
      stiffness: 100,
    },
  });

  const opacity = interpolate(
    frame,
    [durationFrames - 15, durationFrames],
    [1, 0],
    { extrapolateLeft: 'clamp' }
  );

  return (
    <div
      style={{
        transform: `scale(${entrance * pulseScale})`,
        opacity,
      }}
    >
      <span
        style={{
          fontSize,
          fontWeight: 'bold',
          color: textColor,
          textShadow: `
            0 0 ${glowIntensity}px ${textColor},
            0 0 ${glowIntensity * 2}px ${textColor}80,
            0 0 ${glowIntensity * 3}px ${textColor}40
          `,
        }}
      >
        {text}
      </span>
    </div>
  );
};

// ============================================================
// Question Hook
// ============================================================

const QuestionHook: React.FC<RenderContext> = ({
  text,
  textColor,
  fontSize,
  frame,
  fps,
  durationFrames,
}) => {
  const revealPoint = fps * 1.5; // Reveal text at 1.5 seconds

  // Question mark animation
  const questionScale = frame < revealPoint
    ? spring({
        frame,
        fps,
        config: { damping: 10, stiffness: 100 },
      })
    : interpolate(frame, [revealPoint, revealPoint + 10], [1, 0], {
        extrapolateRight: 'clamp',
      });

  // Text reveal
  const textOpacity = interpolate(
    frame,
    [revealPoint, revealPoint + 15],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const textScale = spring({
    frame: Math.max(0, frame - revealPoint),
    fps,
    config: { damping: 15, stiffness: 80 },
  });

  const finalOpacity = interpolate(
    frame,
    [durationFrames - 15, durationFrames],
    [1, 0],
    { extrapolateLeft: 'clamp' }
  );

  return (
    <div style={{ position: 'relative', opacity: finalOpacity }}>
      {/* Question mark */}
      {questionScale > 0.01 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%) scale(${questionScale})`,
            opacity: questionScale,
          }}
        >
          <span
            style={{
              fontSize: fontSize * 2,
              fontWeight: 'bold',
              color: textColor,
            }}
          >
            ?
          </span>
        </div>
      )}

      {/* Revealed text */}
      <div
        style={{
          opacity: textOpacity,
          transform: `scale(${textScale})`,
        }}
      >
        <span
          style={{
            fontSize,
            fontWeight: 'bold',
            color: textColor,
          }}
        >
          {text}
        </span>
      </div>
    </div>
  );
};

// ============================================================
// Counter Hook
// ============================================================

const CounterHook: React.FC<RenderContext> = ({
  text,
  textColor,
  fontSize,
  frame,
  fps,
  durationFrames,
}) => {
  const countDuration = fps * 2; // 2 seconds of counting
  const countProgress = Math.min(frame / countDuration, 1);

  // If text is a number, count up to it
  const targetNumber = parseInt(text, 10);
  const isNumber = !isNaN(targetNumber);

  let displayText: string;
  if (isNumber) {
    const currentNumber = Math.floor(countProgress * targetNumber);
    displayText = currentNumber.toString();
  } else {
    // For non-numbers, just show the text with fade in
    displayText = text;
  }

  const scale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  const opacity = interpolate(
    frame,
    [durationFrames - 15, durationFrames],
    [1, 0],
    { extrapolateLeft: 'clamp' }
  );

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      <span
        style={{
          fontSize: fontSize * (isNumber ? 1.5 : 1),
          fontWeight: 'bold',
          color: textColor,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {displayText}
      </span>
    </div>
  );
};

// ============================================================
// Exports
// ============================================================

export default HookRenderer;
