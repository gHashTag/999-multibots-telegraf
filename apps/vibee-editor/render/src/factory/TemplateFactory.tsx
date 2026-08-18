/**
 * Template Factory Component
 *
 * Main factory component that wraps LipSyncMain with configurable:
 * - Avatar positions (8 variants)
 * - Hook styles (7 variants)
 * - Caption styles (7 variants)
 * - B-roll patterns (4 variants)
 *
 * This component orchestrates all the factory parts and provides
 * a single entry point for rendering template variations.
 */

import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  Audio,
  Video,
  Img,
  interpolate,
  Easing,
} from 'remotion';
import { z } from 'zod';
import { resolveMediaPath } from '../shared/mediaPath';

import type {
  TalkingHeadProps,
  BRollSegment,
  AvatarPosition,
} from './types';
import { TalkingHeadPropsSchema } from './schemas';

import {
  AvatarLayoutAdapter,
  AVATAR_LAYOUTS,
  supportsMorphing,
  isSplitLayout,
  getContentArea,
} from './parts/AvatarLayouts';

import { HookRenderer } from './parts/HookStyles';

import {
  generateBRollSegments,
  getActiveSegment,
} from './parts/BRollPatterns';

import { AvatarMorph } from './parts/AvatarMorph';

// ============================================================
// Schema Export
// ============================================================

export const FactoryTalkingHeadSchema = TalkingHeadPropsSchema;

// ============================================================
// Props Type
// ============================================================

export type FactoryTalkingHeadProps = z.infer<typeof FactoryTalkingHeadSchema>;

// ============================================================
// Main Component
// ============================================================

export const FactoryTalkingHead: React.FC<FactoryTalkingHeadProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();

  // Calculate timing - skip hook if no text provided
  const effectiveHookDuration = props.hookText ? props.hookDuration : 0;
  const hookEndFrame = effectiveHookDuration * fps;
  const mainStartFrame = hookEndFrame;

  // Generate B-roll segments
  const bRollSegments = useMemo(() => {
    return generateBRollSegments(props.bRollPattern, {
      totalFrames: durationInFrames,
      fps,
      segmentDurationFrames: props.bRollDuration * fps,
      gapDurationFrames: props.bRollGapDuration * fps,
      videoUrls: props.backgroundVideos,
      hookEndFrame,
    });
  }, [
    props.bRollPattern,
    props.bRollDuration,
    props.bRollGapDuration,
    props.backgroundVideos,
    durationInFrames,
    fps,
    hookEndFrame,
  ]);

  // Calculate morph state for avatar
  const morphState = useMemo(() => {
    if (!supportsMorphing(props.avatarPosition)) {
      return 0;
    }

    // Morph based on B-roll segments
    const activeSegment = getActiveSegment(bRollSegments, frame);
    const transitionFrames = fps * 1.2; // 1.2 second transition

    if (activeSegment) {
      // Shrink when B-roll is active
      const segmentProgress = (frame - activeSegment.startFrame) / transitionFrames;
      return Math.min(1, segmentProgress) * 0; // Stay small during B-roll
    }

    // Check if transitioning into or out of a segment
    for (const seg of bRollSegments) {
      // Transitioning into segment (shrink)
      if (frame >= seg.startFrame - transitionFrames && frame < seg.startFrame) {
        const progress = (frame - (seg.startFrame - transitionFrames)) / transitionFrames;
        return 1 - progress; // 1 -> 0 (fullscreen -> circle)
      }

      // Transitioning out of segment (grow)
      const segEnd = seg.startFrame + seg.durationFrames;
      if (frame >= segEnd && frame < segEnd + transitionFrames) {
        const progress = (frame - segEnd) / transitionFrames;
        return progress; // 0 -> 1 (circle -> fullscreen)
      }
    }

    // Default: fullscreen when no B-roll
    return 1;
  }, [frame, bRollSegments, props.avatarPosition, fps]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {/* Hook Layer (first N seconds) */}
      {props.hookStyle !== 'none' && props.hookText && (
        <Sequence from={0} durationInFrames={hookEndFrame}>
          <HookRenderer
            style={props.hookStyle}
            text={props.hookText}
            textColor={props.captionFontColor}
            backgroundColor="rgba(0,0,0,0.8)"
            fontSize={96}
            durationFrames={hookEndFrame}
          />
        </Sequence>
      )}

      {/* Main Content Layer */}
      <Sequence from={mainStartFrame}>
        <AbsoluteFill>
          {/* B-Roll Background Layer */}
          <BRollLayer
            segments={bRollSegments}
            frame={frame - mainStartFrame}
            fps={fps}
            colorCorrection={props.colorCorrection}
            avatarPosition={props.avatarPosition}
            width={width}
            height={height}
          />

          {/* Avatar Layer - use AvatarMorph for morphing positions */}
          {supportsMorphing(props.avatarPosition) ? (
            <AvatarMorph
              lipSyncVideo={props.lipSyncVideo}
              segments={bRollSegments}
              circleSizePercent={props.circleSizePercent}
              circleBottomPercent={props.circleBottomPercent}
              circleLeftPx={props.circleLeftPx}
              glassMorphism={props.glassMorphism}
              colorCorrection={props.colorCorrection}
            />
          ) : (
            <AvatarLayer
              lipSyncVideo={props.lipSyncVideo}
              position={props.avatarPosition}
              morphState={morphState}
              circleSizePercent={props.circleSizePercent}
              circleBottomPercent={props.circleBottomPercent}
              circleLeftPx={props.circleLeftPx}
              glassMorphism={props.glassMorphism}
            />
          )}

          {/* Effects Layer */}
          <EffectsLayer
            vignetteStrength={props.vignetteStrength}
            filmGrainOpacity={props.filmGrainOpacity}
          />

          {/* Caption Layer */}
          {props.captionStyle !== 'none' && props.captions.length > 0 && (
            <CaptionLayer
              style={props.captionStyle}
              captions={props.captions}
              position={props.captionPosition}
              fontSize={props.captionFontSize}
              fontColor={props.captionFontColor}
              highlightColor={props.captionHighlightColor}
              frame={frame - mainStartFrame}
              fps={fps}
            />
          )}
        </AbsoluteFill>
      </Sequence>

      {/* Background Music */}
      {props.backgroundMusic && (
        <Audio
          src={resolveMediaPath(props.backgroundMusic, { resolvePlaceholders: true })}
          volume={props.musicVolume}
        />
      )}
    </AbsoluteFill>
  );
};

// ============================================================
// Avatar Layer Component
// ============================================================

interface AvatarLayerProps {
  lipSyncVideo: string;
  position: AvatarPosition;
  morphState: number;
  circleSizePercent: number;
  circleBottomPercent: number;
  circleLeftPx: number;
  glassMorphism: boolean;
}

const AvatarLayer: React.FC<AvatarLayerProps> = ({
  lipSyncVideo,
  position,
  morphState,
  glassMorphism,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Glass morphism effect
  const glassRotation = interpolate(frame, [0, fps * 10], [0, 360], {
    extrapolateRight: 'extend',
  });

  return (
    <AvatarLayoutAdapter
      position={position}
      morphState={morphState}
      enableMorphing={supportsMorphing(position)}
    >
      {/* Glass effect behind avatar */}
      {glassMorphism && morphState < 0.5 && (
        <div
          style={{
            position: 'absolute',
            inset: -10,
            borderRadius: '50%',
            background: `conic-gradient(
              from ${glassRotation}deg,
              rgba(255,255,255,0.1),
              rgba(255,255,255,0.3),
              rgba(255,255,255,0.1)
            )`,
            filter: 'blur(10px)',
            zIndex: -1,
          }}
        />
      )}

      {/* Avatar Video */}
      <Video
        src={resolveMediaPath(lipSyncVideo, { resolvePlaceholders: true })}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </AvatarLayoutAdapter>
  );
};

// ============================================================
// B-Roll Layer Component
// ============================================================

interface BRollLayerProps {
  segments: BRollSegment[];
  frame: number;
  fps: number;
  colorCorrection: number;
  avatarPosition: AvatarPosition;
  width: number;
  height: number;
}

const BRollLayer: React.FC<BRollLayerProps> = ({
  segments,
  frame,
  fps,
  colorCorrection,
  avatarPosition,
  width,
  height,
}) => {
  const activeSegment = getActiveSegment(segments, frame);

  if (!activeSegment) {
    return null;
  }

  const transitionFrames = fps * 0.5;
  const segmentFrame = frame - activeSegment.startFrame;

  // Fade in/out
  const opacity = interpolate(
    segmentFrame,
    [0, transitionFrames, activeSegment.durationFrames - transitionFrames, activeSegment.durationFrames],
    [0, activeSegment.opacity, activeSegment.opacity, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Animation transform
  const transform = getAnimationTransform(
    activeSegment.animation,
    segmentFrame / activeSegment.durationFrames
  );

  // Content area for split layouts
  const contentArea = getContentArea(avatarPosition, width, height);

  const style: React.CSSProperties = {
    position: 'absolute',
    opacity,
    filter: `brightness(${colorCorrection * 0.95}) contrast(1.15) saturate(1.3)`,
    mixBlendMode: activeSegment.blendMode,
    transform,
    ...(contentArea
      ? {
          left: contentArea.x,
          top: contentArea.y,
          width: contentArea.width,
          height: contentArea.height,
        }
      : {
          inset: 0,
        }),
  };

  return (
    <div style={style}>
      <Video
        src={resolveMediaPath(activeSegment.videoUrl, { resolvePlaceholders: true })}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
        muted
      />
    </div>
  );
};

function getAnimationTransform(
  animation: BRollSegment['animation'],
  progress: number
): string {
  switch (animation) {
    case 'zoom-in':
      return `scale(${1 + progress * 0.2})`;
    case 'zoom-out':
      return `scale(${1.2 - progress * 0.2})`;
    case 'pan-right':
      return `translateX(${-10 + progress * 20}%)`;
    case 'pan-left':
      return `translateX(${10 - progress * 20}%)`;
    case 'rotate-zoom':
      return `scale(${1 + progress * 0.1}) rotate(${progress * 3}deg)`;
    default:
      return 'none';
  }
}

// ============================================================
// Effects Layer Component
// ============================================================

interface EffectsLayerProps {
  vignetteStrength: number;
  filmGrainOpacity: number;
}

const EffectsLayer: React.FC<EffectsLayerProps> = ({
  vignetteStrength,
  filmGrainOpacity,
}) => {
  return (
    <>
      {/* Vignette */}
      {vignetteStrength > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(
              ellipse at center,
              transparent 50%,
              rgba(0,0,0,${vignetteStrength}) 100%
            )`,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Film Grain */}
      {filmGrainOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: filmGrainOpacity,
            background: `repeating-linear-gradient(
              0deg,
              rgba(255,255,255,0.03) 0px,
              rgba(0,0,0,0.03) 1px,
              transparent 1px,
              transparent 2px
            )`,
            pointerEvents: 'none',
          }}
        />
      )}
    </>
  );
};

// ============================================================
// Caption Layer Component
// ============================================================

interface CaptionLayerProps {
  style: string;
  captions: Array<{
    text: string;
    startFrame: number;
    endFrame: number;
    highlight?: string;
  }>;
  position: 'top' | 'center' | 'bottom';
  fontSize: number;
  fontColor: string;
  highlightColor: string;
  frame: number;
  fps: number;
}

const CaptionLayer: React.FC<CaptionLayerProps> = ({
  captions,
  position,
  fontSize,
  fontColor,
  highlightColor,
  frame,
}) => {
  // Find active caption
  const activeCaption = captions.find(
    (c) => frame >= c.startFrame && frame < c.endFrame
  );

  if (!activeCaption) {
    return null;
  }

  const progress = (frame - activeCaption.startFrame) / (activeCaption.endFrame - activeCaption.startFrame);

  // Fade in/out
  const opacity = interpolate(
    progress,
    [0, 0.1, 0.9, 1],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Always center captions to avoid overlap with avatar circle
  const positionStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '0 40px',
    top: '45%',  // Slightly above center to clear avatar
    transform: 'translateY(-50%)',
  };

  return (
    <div style={positionStyle}>
      <div
        style={{
          opacity,
          padding: '16px 32px',
          borderRadius: 16,
          backgroundColor: 'rgba(0,0,0,0.85)',  // Darker for better readability
          maxWidth: 900,
          backdropFilter: 'blur(8px)',  // Glass effect
          boxShadow: '0 4px 30px rgba(0,0,0,0.5)',
        }}
      >
        <span
          style={{
            fontSize,
            fontWeight: 600,
            color: fontColor,
            textAlign: 'center',
            display: 'block',
            textShadow: '0 2px 10px rgba(0,0,0,0.9), 0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          {activeCaption.highlight
            ? renderHighlightedText(activeCaption.text, activeCaption.highlight, highlightColor)
            : activeCaption.text}
        </span>
      </div>
    </div>
  );
};

function renderHighlightedText(
  text: string,
  highlight: string,
  highlightColor: string
): React.ReactNode {
  const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === highlight.toLowerCase() ? (
      <span key={i} style={{ color: highlightColor }}>
        {part}
      </span>
    ) : (
      part
    )
  );
}

// ============================================================
// Default Export
// ============================================================

export default FactoryTalkingHead;
