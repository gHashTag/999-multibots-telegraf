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

/** Frames the call to action takes to appear in the pause. */
export const CTA_IN_FRAMES = 6

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
  /**
   * The pause for the call to action: the last frame held while the call
   * stands on screen, seconds. Three by default since 2026-09-26 -- at two,
   * with a fade, the call was readable for well under two seconds, not long
   * enough to decide anything (the owner: "add a pause at the end for the
   * CTA").
   */
  pauseSec: z.number().min(0).max(4).default(3),
  /**
   * A breath between two lines: the scene's last frame held, silent, before
   * the cut. Without it one line ran straight into the next and the owner
   * heard the voice "cut off unevenly" (2026-09-26).
   */
  breathSec: z.number().min(0).max(1).default(0.25),
  /** Optional words shown during the pause, e.g. the bot to open. */
  cta: z.string().default(''),
  /**
   * THE CLIENT'S OWN VISUAL AT THE END (owner, 2026-09-27: "with her face,
   * and after that her visual at the end"). When set, the pause is not the
   * held last frame: it is a card in the client's own palette -- her
   * background, her title colour for the call, her accent for the button
   * line -- read from `profile.visual` by the story template. Flat on
   * purpose: no glow, no vignette (her own "avoid" list forbids both).
   */
  endCard: z
    .object({
      bg: z.string().default('#000000'),
      title: z.string().default('#FFD700'),
      text: z.string().default('#FFFFFF'),
      accent: z.string().default('#00FF88'),
      /** The button line under the call: "🎲 Играть в Лилу · @bot". */
      button: z.string().default(''),
    })
    .optional(),
  music: z.string().optional(),
  musicVolume: z.number().default(0.06),
})

export type StoryReelProps = z.infer<typeof StoryReelSchema>

/**
 * A clip's length in frames, rounded UP. `Math.round` cut up to half a frame
 * off the end of every line -- the last sound of the last word -- and that is
 * the uneven cut the owner heard (2026-09-26). A frame too long is a frame of
 * the clip's own silence; a frame too short is a clipped word.
 */
export function sceneFramesOf(seconds: number, fps: number): number {
  return Math.max(1, Math.ceil(Number((seconds * fps).toFixed(6))))
}

/** The whole story: every line, a breath between lines, then the pause. */
export function storyDurationFrames(
  sceneFrames: readonly number[],
  pauseFrames: number,
  breathFrames = 0
): number {
  const lines = sceneFrames.reduce((a, b) => a + b, 0)
  return (
    lines + breathFrames * Math.max(0, sceneFrames.length - 1) + pauseFrames
  )
}

/** Where each scene starts, how long its line runs, and the breath after it. */
export function storyTimeline(
  sceneCount: number,
  sceneFrames: readonly number[],
  totalFrames: number,
  pauseFrames: number,
  breathFrames = 0
): { from: number; frames: number; breath: number }[] {
  const measured =
    sceneFrames.length === sceneCount && sceneFrames.every(f => f > 0)
  const breaths = breathFrames * Math.max(0, sceneCount - 1)
  const even = Math.max(
    1,
    Math.floor((totalFrames - pauseFrames - breaths) / Math.max(1, sceneCount))
  )
  let from = 0
  return Array.from({ length: sceneCount }, (_, i) => {
    const frames = measured ? sceneFrames[i] : even
    // The last line is followed by the pause, which is a longer breath.
    const breath = i < sceneCount - 1 ? breathFrames : 0
    const at = { from, frames, breath }
    from += frames + breath
    return at
  })
}

/** Frames of the fade at each end of a line: no click on the cut. */
export const FADE_IN_FRAMES = 1
export const FADE_OUT_FRAMES = 3

/**
 * The line's volume at a frame of its scene. A hard cut through a waveform
 * clicks; a tenth of a second of fade at the end lands in the TTS's own
 * trailing silence, and one frame at the start keeps the first syllable.
 */
export function sceneVolume(frame: number, frames: number): number {
  if (frames <= FADE_IN_FRAMES + FADE_OUT_FRAMES + 2) return 1
  return interpolate(
    frame,
    [0, FADE_IN_FRAMES, frames - FADE_OUT_FRAMES, frames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )
}

/** A clip's last frame, held still and silent. */
const HeldFrame: React.FC<{ src: string; at: number }> = ({ src, at }) => (
  // The clip starts AT its last frame and that frame is frozen: Remotion
  // bounds a video's time by its Sequence, so freezing frame N of a clip
  // inside a shorter Sequence showed the wrong one.
  <Freeze frame={0}>
    <OffthreadVideo
      src={src}
      trimBefore={Math.max(0, at)}
      muted
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  </Freeze>
)

const CallToAction: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame()
  // In at once (0.2 s) and held for the whole pause: the pause is for
  // reading the call, not for watching it arrive.
  const opacity = interpolate(frame, [0, CTA_IN_FRAMES], [0, 1], {
    extrapolateRight: 'clamp',
  })
  const rise = interpolate(frame, [0, CTA_IN_FRAMES], [24, 0], {
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

/** The pause as the client's own card: her colours, her call, her button. */
const EndCard: React.FC<{
  card: NonNullable<StoryReelProps['endCard']>
  cta: string
}> = ({ card, cta }) => {
  const frame = useCurrentFrame()
  // Fades in over the held last frame, so the cut to the card is not a jump.
  const opacity = interpolate(frame, [0, CTA_IN_FRAMES], [0, 1], {
    extrapolateRight: 'clamp',
  })
  return (
    <AbsoluteFill
      style={{
        opacity,
        backgroundColor: card.bg,
        justifyContent: 'center',
        alignItems: 'center',
        padding: '0 90px',
      }}
    >
      {cta ? (
        <div
          style={{
            fontFamily: font,
            fontWeight: 500,
            fontSize: 66,
            lineHeight: 1.2,
            color: card.title,
            textAlign: 'center',
          }}
        >
          {cta}
        </div>
      ) : null}
      <div
        style={{
          marginTop: 44,
          width: 180,
          height: 2,
          backgroundColor: card.text,
          opacity: 0.35,
        }}
      />
      {card.button ? (
        <div
          style={{
            marginTop: 44,
            fontFamily: font,
            fontWeight: 400,
            fontSize: 44,
            color: card.accent,
            textAlign: 'center',
          }}
        >
          {card.button}
        </div>
      ) : null}
    </AbsoluteFill>
  )
}

export const StoryReel: React.FC<StoryReelProps> = props => {
  const { fps, durationInFrames } = useVideoConfig()
  const pauseFrames = Math.round((props.pauseSec ?? 3) * fps)
  const breathFrames = Math.round((props.breathSec ?? 0) * fps)
  const timeline = storyTimeline(
    props.scenes.length,
    props.sceneFrames ?? [],
    durationInFrames,
    pauseFrames,
    breathFrames
  )
  const last = timeline[timeline.length - 1]
  const lastScene = props.scenes[props.scenes.length - 1]
  const pauseFrom = last ? last.from + last.frames : 0

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {props.scenes.map((scene, i) => (
        <React.Fragment key={i}>
          <Sequence
            from={timeline[i].from}
            durationInFrames={timeline[i].frames}
            name={`Scene ${i + 1}`}
          >
            <OffthreadVideo
              src={scene.video}
              volume={f => sceneVolume(f, timeline[i].frames)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </Sequence>
          {timeline[i].breath > 0 ? (
            <Sequence
              from={timeline[i].from + timeline[i].frames}
              durationInFrames={timeline[i].breath}
              name={`Breath ${i + 1}`}
            >
              <HeldFrame src={scene.video} at={timeline[i].frames - 1} />
            </Sequence>
          ) : null}
        </React.Fragment>
      ))}

      {pauseFrames > 0 && lastScene ? (
        <Sequence
          from={pauseFrom}
          durationInFrames={pauseFrames}
          name="Pause to decide"
        >
          <HeldFrame src={lastScene.video} at={last.frames - 1} />
          {props.endCard ? (
            <EndCard card={props.endCard} cta={props.cta} />
          ) : props.cta ? (
            <CallToAction text={props.cta} />
          ) : null}
        </Sequence>
      ) : null}

      {props.music ? (
        <Audio src={props.music} volume={props.musicVolume} />
      ) : null}
    </AbsoluteFill>
  )
}
