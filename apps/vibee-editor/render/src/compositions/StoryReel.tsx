import React from 'react'
import {
  AbsoluteFill,
  Audio,
  Freeze,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { z } from 'zod'
import { loadFont as loadOutfit } from '@remotion/google-fonts/Outfit'
import { loadFont as loadJost } from '@remotion/google-fonts/Jost'

/**
 * StoryReel -- a mini-story told by the owner's talking face, scene by scene.
 *
 * The owner's shape, 2026-09-26: "change the picture, not the same one -- a
 * mini story about anything, in one style but in different settings by the
 * topic; three pictures, three scenes and the cuts, a call to action at the
 * end and a pause to decide; the whole reel at most 15 seconds, for stories".
 *
 * Every scene is a lip-synced clip that already carries its own line (one
 * `image_edit` still in its own setting, one voice line, one
 * `lipsync_generate`). This template only puts them in order with hard cuts,
 * then holds the last frame for the pause, where an optional call to action
 * fades in. Nothing here is spoken or drawn over the face while it talks:
 * the owner's rule is no captions unless asked.
 *
 * The scene lengths come from the clips themselves (Root.tsx measures them in
 * calculateMetadata), so the cuts land exactly where each line ends.
 */

const { fontFamily: outfitLatin } = loadOutfit('normal', {
  weights: ['500', '700'],
  subsets: ['latin'],
})
const { fontFamily: jost } = loadJost('normal', {
  weights: ['500', '700'],
  subsets: ['cyrillic', 'latin'],
})
const font = `${outfitLatin}, ${jost}, sans-serif`

// The t27.ai tokens NoirReel uses: black, white, gold only on the call.
const BG = '#000000'
const TEXT = '#FFFFFF'
const GOLDEN = '#FFD700'

/** The longest story this template is meant for, seconds (the stories cap). */
export const STORY_MAX_SECONDS = 15

export const StoryReelSchema = z.object({
  /** The scenes in order: each a lip-synced clip with its own line. */
  scenes: z
    .array(
      z.object({
        // A scene with no source would crash the whole render minutes in
        // (the NoirReel lesson, a-reel-without-footage-is-refused.test.ts).
        video: z.string().min(1, { message: 'сцена без video' }),
      })
    )
    .min(1, { message: 'StoryReel без сцен — это не ролик' })
    .max(6, { message: 'не больше 6 сцен' }),
  /** Frames of each scene; filled by calculateMetadata from the clips. */
  sceneFrames: z.array(z.number()).default([]),
  /** The pause after the call to action: the last frame held, seconds. */
  pauseSec: z.number().min(0).max(3).default(2),
  /** Optional words shown during the pause, e.g. the bot to open. */
  cta: z.string().default(''),
  music: z.string().optional(),
  musicVolume: z.number().default(0.06),
})

export type StoryReelProps = z.infer<typeof StoryReelSchema>

/** Where each scene starts and how long it runs, in frames. */
export function storyTimeline(
  sceneCount: number,
  sceneFrames: readonly number[],
  totalFrames: number,
  pauseFrames: number
): { from: number; frames: number }[] {
  const measured =
    sceneFrames.length === sceneCount && sceneFrames.every(f => f > 0)
  const even = Math.max(
    1,
    Math.floor((totalFrames - pauseFrames) / Math.max(1, sceneCount))
  )
  let from = 0
  return Array.from({ length: sceneCount }, (_, i) => {
    const frames = measured ? sceneFrames[i] : even
    const at = { from, frames }
    from += frames
    return at
  })
}

const CallToAction: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: 'clamp',
  })
  const rise = interpolate(frame, [0, 10], [24, 0], {
    extrapolateRight: 'clamp',
  })
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 260,
        background:
          'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 45%)',
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${rise}px)`,
          fontFamily: font,
          fontWeight: 700,
          fontSize: 64,
          color: GOLDEN,
          textAlign: 'center',
          lineHeight: 1.15,
          padding: '0 80px',
          textShadow: '0 2px 18px rgba(0,0,0,0.9)',
        }}
      >
        {text}
      </div>
      <div
        style={{
          marginTop: 28,
          width: 180,
          height: 2,
          backgroundColor: TEXT,
          opacity: opacity * 0.5,
        }}
      />
    </AbsoluteFill>
  )
}

export const StoryReel: React.FC<StoryReelProps> = props => {
  const { fps, durationInFrames } = useVideoConfig()
  const pauseFrames = Math.round((props.pauseSec ?? 0) * fps)
  const timeline = storyTimeline(
    props.scenes.length,
    props.sceneFrames ?? [],
    durationInFrames,
    pauseFrames
  )
  const last = timeline[timeline.length - 1]
  const lastScene = props.scenes[props.scenes.length - 1]
  const pauseFrom = last ? last.from + last.frames : 0

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {props.scenes.map((scene, i) => (
        <Sequence
          key={i}
          from={timeline[i].from}
          durationInFrames={timeline[i].frames}
          name={`Scene ${i + 1}`}
        >
          <OffthreadVideo
            src={scene.video}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </Sequence>
      ))}

      {pauseFrames > 0 && lastScene ? (
        <Sequence
          from={pauseFrom}
          durationInFrames={pauseFrames}
          name="Pause to decide"
        >
          {/* The clip starts AT its last frame and that frame is frozen:
              Remotion bounds a video's time by its Sequence, so freezing
              frame N of a clip inside a shorter pause showed the wrong one. */}
          <Freeze frame={0}>
            <OffthreadVideo
              src={lastScene.video}
              trimBefore={Math.max(0, last.frames - 1)}
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </Freeze>
          {props.cta ? <CallToAction text={props.cta} /> : null}
        </Sequence>
      ) : null}

      {props.music ? (
        <Audio src={props.music} volume={props.musicVolume} />
      ) : null}
    </AbsoluteFill>
  )
}
