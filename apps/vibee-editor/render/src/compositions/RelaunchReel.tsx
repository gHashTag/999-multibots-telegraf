import React from 'react';
import {
  AbsoluteFill,
  Audio,
  interpolate,
  random,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from 'remotion';
import { z } from 'zod';
import { loadFont as loadUnbounded } from '@remotion/google-fonts/Unbounded';
import { loadFont as loadManrope } from '@remotion/google-fonts/Manrope';

/**
 * RelaunchReel — промо-рилс «мы открылись, рилсы прямо в боте».
 *
 * Полностью самодостаточная композиция: никаких внешних медиа (b-rolls,
 * lipsync, музыки) — только типографика и процедурная графика. Поэтому она
 * рендерится локально и на сервере без единого сетевого запроса, в отличие от
 * SplitTalkingHead, которому нужен живой lipSyncVideo.
 *
 * 1080×1920 @ 30fps, 540 кадров = 18 секунд.
 */

const { fontFamily: unbounded } = loadUnbounded('normal', {
  weights: ['400', '700', '900'],
  subsets: ['cyrillic', 'latin'],
});
const { fontFamily: manrope } = loadManrope('normal', {
  weights: ['400', '600', '800'],
  subsets: ['cyrillic', 'latin'],
});

export const RelaunchReelSchema = z.object({
  botHandle: z.string(),
  ctaCommand: z.string(),
  accentA: z.string(),
  accentB: z.string(),
  accentC: z.string(),
});

type Props = z.infer<typeof RelaunchReelSchema>;

// ---------------------------------------------------------------- background

const Blob: React.FC<{
  seed: string;
  color: string;
  size: number;
  cx: number;
  cy: number;
  drift: number;
}> = ({ seed, color, size, cx, cy, drift }) => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const x = cx + Math.sin(t * 0.4 + random(seed) * 6.28) * drift;
  const y = cy + Math.cos(t * 0.3 + random(seed + 'y') * 6.28) * drift;
  return (
    <div
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        opacity: 0.55,
        filter: 'blur(40px)',
      }}
    />
  );
};

const Particles: React.FC<{ count: number; color: string }> = ({
  count,
  color,
}) => {
  const frame = useCurrentFrame();
  const { height, width } = useVideoConfig();
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const seed = `p${i}`;
        const speed = 0.6 + random(seed) * 1.4;
        const x = random(seed + 'x') * width;
        const y = ((random(seed + 'y') * height + frame * speed) % (height + 40)) - 20;
        const s = 2 + random(seed + 's') * 4;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: height - y,
              width: s,
              height: s,
              borderRadius: '50%',
              background: color,
              opacity: 0.25 + random(seed + 'o') * 0.35,
            }}
          />
        );
      })}
    </>
  );
};

const Backdrop: React.FC<Props> = ({ accentA, accentB, accentC }) => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: '#07070f', overflow: 'hidden' }}>
      <Blob seed="a" color={accentA} size={900} cx={width * 0.2} cy={height * 0.18} drift={90} />
      <Blob seed="b" color={accentB} size={1100} cx={width * 0.85} cy={height * 0.5} drift={120} />
      <Blob seed="c" color={accentC} size={800} cx={width * 0.3} cy={height * 0.85} drift={100} />
      <Particles count={40} color="#ffffff" />
      {/* виньетка */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.55) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------- helpers

const GradientText: React.FC<{
  children: React.ReactNode;
  from: string;
  to: string;
  style?: React.CSSProperties;
}> = ({ children, from, to, style }) => (
  <span
    style={{
      background: `linear-gradient(100deg, ${from}, ${to})`,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      ...style,
    }}
  >
    {children}
  </span>
);

/** Слово въезжает пружиной, с лёгким поворотом. */
const PopWord: React.FC<{
  delay: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 140 } });
  return (
    <div
      style={{
        transform: `scale(${s}) rotate(${(1 - s) * -6}deg)`,
        opacity: Math.min(1, s * 1.4),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// -------------------------------------------------------------------- scenes

/** Сцена 1: холодный открыватель. */
const SceneOpen: React.FC<Props> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slam = spring({ frame: frame - 14, fps, config: { damping: 11, stiffness: 180 } });
  const flash = interpolate(frame, [14, 15, 26], [0, 0.9, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const out = interpolate(frame, [62, 75], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{ justifyContent: 'center', alignItems: 'center', opacity: out }}
    >
      <div
        style={{
          fontFamily: manrope,
          fontWeight: 600,
          fontSize: 44,
          letterSpacing: 14,
          color: 'rgba(255,255,255,0.75)',
          opacity: interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' }),
          marginBottom: 40,
          textTransform: 'uppercase',
        }}
      >
        Мы снова в деле
      </div>
      <div
        style={{
          fontFamily: unbounded,
          fontWeight: 900,
          fontSize: 150,
          lineHeight: 1.02,
          textAlign: 'center',
          transform: `scale(${0.6 + slam * 0.4})`,
          opacity: slam,
          textShadow: `0 0 ${flash * 120}px ${p.accentA}`,
        }}
      >
        <GradientText from={p.accentA} to={p.accentB}>
          ПЕРЕ
          <br />
          ЗАПУСК
        </GradientText>
      </div>
      <div
        style={{
          fontSize: 90,
          marginTop: 46,
          transform: `translateY(${(1 - slam) * 60}px)`,
          opacity: slam,
        }}
      >
        🚀
      </div>
    </AbsoluteFill>
  );
};

/** Сцена 2: главное заявление. */
const SceneClaim: React.FC<Props> = (p) => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [92, 105], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        opacity: out,
        padding: 70,
      }}
    >
      <div
        style={{
          fontFamily: unbounded,
          fontWeight: 700,
          fontSize: 84,
          textAlign: 'center',
          color: '#fff',
          lineHeight: 1.15,
        }}
      >
        <PopWord delay={0}>РИЛСЫ</PopWord>
        <PopWord delay={7}>
          <span style={{ fontWeight: 400, fontSize: 62 }}>теперь</span>
        </PopWord>
        <PopWord delay={13}>
          <GradientText from={p.accentB} to={p.accentC} style={{ fontWeight: 900, fontSize: 108 }}>
            ПРЯМО В БОТЕ
          </GradientText>
        </PopWord>
      </div>
      <PopWord delay={26}>
        <div
          style={{
            fontFamily: manrope,
            fontWeight: 600,
            fontSize: 46,
            color: 'rgba(255,255,255,0.8)',
            marginTop: 60,
            textAlign: 'center',
          }}
        >
          Без камеры. Без монтажа.
          <br />
          Без приложений.
        </div>
      </PopWord>
    </AbsoluteFill>
  );
};

const FEATURES = [
  { icon: '🎬', title: 'AI-видео', sub: 'ролик из текста' },
  { icon: '🗣️', title: 'Говорящие аватары', sub: 'липсинк вашим голосом' },
  { icon: '📸', title: 'Нейрофото', sub: 'вы — в любом образе' },
  { icon: '🎵', title: 'AI-музыка', sub: 'саундтрек за минуту' },
];

/** Сцена 3: стек фич. */
const SceneFeatures: React.FC<Props> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const out = interpolate(frame, [132, 145], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{ justifyContent: 'center', alignItems: 'center', opacity: out }}
    >
      <div
        style={{
          fontFamily: unbounded,
          fontWeight: 700,
          fontSize: 56,
          color: '#fff',
          marginBottom: 70,
          opacity: interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' }),
        }}
      >
        Что умеет бот
      </div>
      {FEATURES.map((f, i) => {
        const d = 8 + i * 13;
        const s = spring({ frame: frame - d, fps, config: { damping: 13, stiffness: 120 } });
        const fromLeft = i % 2 === 0;
        return (
          <div
            key={f.title}
            style={{
              width: 860,
              display: 'flex',
              alignItems: 'center',
              gap: 36,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 36,
              padding: '34px 44px',
              marginBottom: 30,
              backdropFilter: 'blur(12px)',
              transform: `translateX(${(1 - s) * (fromLeft ? -900 : 900)}px) rotate(${(1 - s) * (fromLeft ? -4 : 4)}deg)`,
              opacity: s,
            }}
          >
            <div style={{ fontSize: 78 }}>{f.icon}</div>
            <div>
              <div
                style={{
                  fontFamily: unbounded,
                  fontWeight: 700,
                  fontSize: 52,
                  color: '#fff',
                }}
              >
                {f.title}
              </div>
              <div
                style={{
                  fontFamily: manrope,
                  fontWeight: 600,
                  fontSize: 38,
                  color: p.accentB,
                  marginTop: 6,
                }}
              >
                {f.sub}
              </div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Сцена 4: идея → готовый рилс. */
const SceneFlow: React.FC<Props> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const out = interpolate(frame, [80, 90], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const steps = ['💡 Идея', '✍️ Одно сообщение', '🎬 Готовый рилс'];
  return (
    <AbsoluteFill
      style={{ justifyContent: 'center', alignItems: 'center', opacity: out, gap: 26 }}
    >
      {steps.map((s, i) => {
        const d = 4 + i * 16;
        const sp = spring({ frame: frame - d, fps, config: { damping: 12, stiffness: 130 } });
        return (
          <React.Fragment key={s}>
            {i > 0 && (
              <div
                style={{
                  fontSize: 64,
                  opacity: spring({ frame: frame - d + 6, fps, config: { damping: 14 } }),
                  transform: `translateY(${(1 - sp) * 20}px)`,
                  color: p.accentB,
                }}
              >
                ↓
              </div>
            )}
            <div
              style={{
                fontFamily: unbounded,
                fontWeight: i === 2 ? 900 : 700,
                fontSize: i === 2 ? 88 : 64,
                transform: `scale(${sp})`,
                opacity: sp,
                textAlign: 'center',
              }}
            >
              {i === 2 ? (
                <GradientText from={p.accentA} to={p.accentC}>{s}</GradientText>
              ) : (
                <span style={{ color: '#fff' }}>{s}</span>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

/** Сцена 5: CTA. */
const SceneCta: React.FC<Props> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inS = spring({ frame, fps, config: { damping: 12, stiffness: 120 } });
  const pulse = 1 + Math.sin(frame / 7) * 0.03;
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          fontFamily: unbounded,
          fontWeight: 700,
          fontSize: 66,
          color: '#fff',
          textAlign: 'center',
          transform: `scale(${inS})`,
          lineHeight: 1.2,
        }}
      >
        Попробуй
        <br />
        <GradientText from={p.accentB} to={p.accentA} style={{ fontWeight: 900, fontSize: 80 }}>
          первый рилс
        </GradientText>
      </div>
      <div
        style={{
          marginTop: 80,
          transform: `scale(${inS * pulse})`,
          background: `linear-gradient(100deg, ${p.accentA}, ${p.accentB})`,
          borderRadius: 60,
          padding: '38px 96px',
          fontFamily: unbounded,
          fontWeight: 900,
          fontSize: 72,
          color: '#fff',
          boxShadow: `0 0 90px ${p.accentA}88`,
        }}
      >
        {p.ctaCommand}
      </div>
      <div
        style={{
          marginTop: 56,
          fontFamily: manrope,
          fontWeight: 800,
          fontSize: 52,
          color: 'rgba(255,255,255,0.9)',
          opacity: interpolate(frame, [18, 30], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        {p.botHandle}
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------- root

/**
 * Озвучка: Silero v4_ru (baya), сгенерирована tools/tts/silero_say.py —
 * open-source замена ElevenLabs, работает на CPU без ключей. Реплики лежат в
 * public/vo и подогнаны под длительности сцен (2.24/3.71/4.85/3.19/2.62 c).
 */
const VOICEOVER: Array<{ from: number; file: string }> = [
  { from: 6, file: 'vo/vo1.wav' },
  { from: 78, file: 'vo/vo2.wav' },
  { from: 182, file: 'vo/vo3.wav' },
  { from: 328, file: 'vo/vo4.wav' },
  { from: 420, file: 'vo/vo5.wav' },
];

export const RelaunchReel: React.FC<Props> = (props) => {
  return (
    <AbsoluteFill>
      <Backdrop {...props} />
      {VOICEOVER.map((v) => (
        <Sequence key={v.file} from={v.from}>
          <Audio src={staticFile(v.file)} />
        </Sequence>
      ))}
      <Sequence durationInFrames={75}>
        <SceneOpen {...props} />
      </Sequence>
      <Sequence from={75} durationInFrames={105}>
        <SceneClaim {...props} />
      </Sequence>
      <Sequence from={180} durationInFrames={145}>
        <SceneFeatures {...props} />
      </Sequence>
      <Sequence from={325} durationInFrames={90}>
        <SceneFlow {...props} />
      </Sequence>
      <Sequence from={415}>
        <SceneCta {...props} />
      </Sequence>
    </AbsoluteFill>
  );
};
