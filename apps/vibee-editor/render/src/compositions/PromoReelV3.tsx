import React from 'react';
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { z } from 'zod';
import { loadFont as loadUnbounded } from '@remotion/google-fonts/Unbounded';

/**
 * PromoReelV3 — промо в стиле рилсов владельца (Vibee Reel 01).
 *
 * Отличия от V2, которую он забраковал:
 *   — титры не «плашкой посреди лица»: нижняя треть, безопасные поля,
 *     мягкая подложка-градиент только под текстом;
 *   — размер шрифта считается от длины строки, чтобы длинные фразы не
 *     разъезжались на три строки поверх лица;
 *   — на стыках сцен короткий кросс-фейд, а не резкая склейка;
 *   — CTA не поверх речи, а отдельной концовкой.
 */

const { fontFamily: unbounded } = loadUnbounded('normal', {
  weights: ['700', '900'],
  subsets: ['cyrillic', 'latin'],
});

const SceneSchema = z.object({
  src: z.string(),
  from: z.number(),
  durationInFrames: z.number(),
  /** Сдвиг внутри исходника, чтобы не повторять одну и ту же секунду. */
  startFrom: z.number().optional(),
});

const CaptionSchema = z.object({
  text: z.string(),
  from: z.number(),
  durationInFrames: z.number(),
});

export const PromoReelV3Schema = z.object({
  scenes: z.array(SceneSchema),
  captions: z.array(CaptionSchema),
  voiceover: z.string(),
  music: z.string(),
  musicVolume: z.number(),
  ctaFrom: z.number(),
  ctaText: z.string(),
  botHandle: z.string(),
});

type Props = z.infer<typeof PromoReelV3Schema>;

const FADE = 8;

const Clip: React.FC<{ src: string; startFrom?: number; durationInFrames: number }> = ({
  src,
  startFrom,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  // Кросс-фейд по краям: резкая склейка на 30 fps читается как брак.
  const opacity = Math.min(
    interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: 'clamp' }),
    interpolate(frame, [durationInFrames - FADE, durationInFrames], [1, 0], {
      extrapolateLeft: 'clamp',
    })
  );
  return (
    <AbsoluteFill style={{ opacity }}>
      <OffthreadVideo
        src={src}
        startFrom={startFrom}
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </AbsoluteFill>
  );
};

/** Титр в нижней трети: жёлтый капс, чёрная обводка — как в его рилсе. */
const Caption: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 16, stiffness: 170 } });
  // Длинная фраза — мельче кегль: иначе три строки поверх лица.
  const size = text.length > 22 ? 62 : text.length > 14 ? 72 : 84;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 300 }}>
      <div
        style={{
          maxWidth: 900,
          padding: '18px 34px',
          borderRadius: 28,
          background: 'rgba(0,0,0,0.42)',
          backdropFilter: 'blur(6px)',
          fontFamily: unbounded,
          fontWeight: 900,
          fontSize: size,
          lineHeight: 1.08,
          textAlign: 'center',
          color: '#FFE500',
          textTransform: 'uppercase',
          WebkitTextStroke: '5px #000',
          paintOrder: 'stroke fill',
          transform: `translateY(${(1 - s) * 26}px)`,
          opacity: Math.min(1, s * 1.5),
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

const Cta: React.FC<{ text: string; botHandle: string }> = ({ text, botHandle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <AbsoluteFill style={{ background: `rgba(0,0,0,${0.55 * s})` }} />
      <div
        style={{
          transform: `scale(${0.9 + s * 0.1})`,
          opacity: s,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: unbounded,
            fontWeight: 900,
            fontSize: 92,
            color: '#FFE500',
            WebkitTextStroke: '6px #000',
            paintOrder: 'stroke fill',
          }}
        >
          {text}
        </div>
        <div
          style={{
            marginTop: 26,
            fontFamily: unbounded,
            fontWeight: 700,
            fontSize: 44,
            color: '#fff',
            textShadow: '0 4px 20px rgba(0,0,0,0.9)',
          }}
        >
          {botHandle}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const PromoReelV3: React.FC<Props> = ({
  scenes,
  captions,
  voiceover,
  music,
  musicVolume,
  ctaFrom,
  ctaText,
  botHandle,
}) => (
  <AbsoluteFill style={{ background: '#000' }}>
    {scenes.map((s, i) => (
      <Sequence key={i} from={s.from} durationInFrames={s.durationInFrames}>
        <Clip src={s.src} startFrom={s.startFrom} durationInFrames={s.durationInFrames} />
      </Sequence>
    ))}

    {captions.map((c, i) => (
      <Sequence key={i} from={c.from} durationInFrames={c.durationInFrames}>
        <Caption text={c.text} />
      </Sequence>
    ))}

    <Sequence from={ctaFrom}>
      <Cta text={ctaText} botHandle={botHandle} />
    </Sequence>

    <Audio src={voiceover} />
    <Audio src={music} volume={musicVolume} />
  </AbsoluteFill>
);
