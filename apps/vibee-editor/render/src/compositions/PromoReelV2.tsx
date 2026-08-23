import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
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
 * PromoReelV2 — промо «рилсы прямо в боте» по образцу референса владельца
 * (Vibee Reel 01): сцены с его аватаром, поверх — жёлтые капс-титры по центру,
 * дорожка «голос + музыка».
 *
 * Слои снизу вверх: видео-сцена → затемнение → титр → (в конце) CTA.
 * Все медиа приходят пропсами: композиция ничего не знает о хранилище.
 */

const { fontFamily: unbounded } = loadUnbounded('normal', {
  weights: ['700', '900'],
  subsets: ['cyrillic', 'latin'],
});

const CaptionSchema = z.object({
  text: z.string(),
  /** Кадр начала и длительность — считаются заранее по длине озвучки. */
  from: z.number(),
  durationInFrames: z.number(),
});

const SceneSchema = z.object({
  src: z.string(),
  from: z.number(),
  durationInFrames: z.number(),
  /** Картинку показываем с медленным зумом, видео — как есть. */
  kind: z.enum(['video', 'image']),
});

export const PromoReelV2Schema = z.object({
  scenes: z.array(SceneSchema),
  captions: z.array(CaptionSchema),
  voiceover: z.string(),
  music: z.string(),
  musicVolume: z.number(),
  ctaText: z.string(),
  ctaFrom: z.number(),
  botHandle: z.string(),
});

type Props = z.infer<typeof PromoReelV2Schema>;

/** Сцена: видео во весь экран либо картинка с медленным наездом. */
const Scene: React.FC<{ src: string; kind: 'video' | 'image'; durationInFrames: number }> = ({
  src,
  kind,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  if (kind === 'video') {
    return (
      <AbsoluteFill>
        <OffthreadVideo src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
      </AbsoluteFill>
    );
  }
  const scale = interpolate(frame, [0, durationInFrames], [1, 1.12], {
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill>
      <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})` }} />
    </AbsoluteFill>
  );
};

/**
 * Титр как в референсе: жёлтые капсом, чёрная обводка, центр экрана.
 * Появление пружиной — иначе на 30 кадрах текст «мигает».
 */
const Caption: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 14, stiffness: 160 } });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 60 }}>
      <div
        style={{
          fontFamily: unbounded,
          fontWeight: 900,
          fontSize: 76,
          lineHeight: 1.1,
          textAlign: 'center',
          color: '#FFE500',
          textTransform: 'uppercase',
          WebkitTextStroke: '6px #000',
          paintOrder: 'stroke fill',
          textShadow: '0 6px 24px rgba(0,0,0,0.7)',
          transform: `scale(${0.9 + s * 0.1})`,
          opacity: Math.min(1, s * 1.6),
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
  const s = spring({ frame, fps, config: { damping: 13 } });
  const pulse = 1 + Math.sin(frame / 7) * 0.03;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 220 }}>
      <div
        style={{
          transform: `scale(${s * pulse})`,
          background: 'linear-gradient(100deg,#7C3AED,#06B6D4)',
          borderRadius: 60,
          padding: '30px 76px',
          fontFamily: unbounded,
          fontWeight: 900,
          fontSize: 64,
          color: '#fff',
          boxShadow: '0 0 80px rgba(124,58,237,0.65)',
        }}
      >
        {text}
      </div>
      <div
        style={{
          marginTop: 28,
          fontFamily: unbounded,
          fontWeight: 700,
          fontSize: 40,
          color: '#fff',
          textShadow: '0 4px 18px rgba(0,0,0,0.8)',
          opacity: s,
        }}
      >
        {botHandle}
      </div>
    </AbsoluteFill>
  );
};

export const PromoReelV2: React.FC<Props> = ({
  scenes,
  captions,
  voiceover,
  music,
  musicVolume,
  ctaText,
  ctaFrom,
  botHandle,
}) => {
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {scenes.map((s, i) => (
        <Sequence key={i} from={s.from} durationInFrames={s.durationInFrames}>
          <Scene src={s.src} kind={s.kind} durationInFrames={s.durationInFrames} />
        </Sequence>
      ))}

      {/* Затемнение под титрами: жёлтый по светлой сцене нечитаем. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.05) 65%, rgba(0,0,0,0.55) 100%)',
        }}
      />

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
};
