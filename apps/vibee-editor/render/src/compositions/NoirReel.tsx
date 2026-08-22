import React from 'react';
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { z } from 'zod';
import { loadFont as loadOutfit } from '@remotion/google-fonts/Outfit';
import { loadFont as loadJost } from '@remotion/google-fonts/Jost';

/**
 * NoirReel — канонический шаблон рилса клуба «Золотая Литейная».
 *
 * Два источника канона, оба заданы владельцем 2026-08-22:
 *
 *   1. ФУТАЖ — строго чёрно-белый нуар с эталонного фото: смокинг-тройка,
 *      бабочка, классические чёрные вайфареры, белый платок. Единственный
 *      цвет в кадре — золотой треугольный значок на лацкане. Планы липсинка
 *      меняются на монтажных стыках (все дорожки синхронизированы одним
 *      аудио), рилс ОТКРЫВАЕТСЯ крупным лицом.
 *   2. ГРАФИКА — дизайн-система ГЛАВНОЙ t27.ai (apps/website/src/index.css):
 *      Outfit, чистый чёрный #000, белый текст, приглушённый #888, зелёный
 *      акцент #00FF88 (точечно), золото #FFD700 — ТОЛЬКО имя клуба и CTA.
 *
 * Чем НЕ является: это не SplitTalkingHead (неон, жёлтые титры Montserrat,
 * сплит с биролами) и не TrinityBlogReel (барочная антиква, крем/золото
 * обложек #C9A24B). Третий контур: клубный нуар.
 */

// У Outfit нет кириллицы (на сайте русский тоже падает в system-ui).
// Jost — тот же геометрический гротеск, но с кириллицей: латиница рендерится
// Outfit'ом, русские глифы по цепочке фолбэка уходят в Jost.
const { fontFamily: outfitLatin } = loadOutfit('normal', {
  weights: ['300', '500', '700', '800'],
  subsets: ['latin'],
});
const { fontFamily: jost } = loadJost('normal', {
  weights: ['300', '500', '700'],
  subsets: ['cyrillic', 'latin'],
});
const outfit = `${outfitLatin}, ${jost}, sans-serif`;

// Токены главной t27.ai — не менять в отрыве от apps/website/src/index.css.
const BG = '#000000';
const TEXT = '#FFFFFF';
const MUTED = '#888888';
const ACCENT = '#00FF88';
const GOLDEN = '#FFD700';
const HAIRLINE = 'rgba(255,255,255,0.08)';

export const NoirReelSchema = z.object({
  /** Мультиплановая ч/б липсинк-дорожка (склейка планов, общее аудио). */
  lipSyncVideo: z.string(),
  /** Пословные титры из whisperx; слово с "/" или "t27" красится золотом. */
  captions: z
    .array(
      z.object({
        text: z.string(),
        startMs: z.number(),
        endMs: z.number(),
      })
    )
    .default([]),
  /** Необязательные ч/б перебивки поверх липсинка (глушатся, grayscale). */
  cutaways: z
    .array(
      z.object({
        src: z.string(),
        startFrame: z.number(),
        durationFrames: z.number(),
      })
    )
    .default([]),
  music: z.string().optional(),
  musicVolume: z.number().default(0.07),
  /** Старт финальной карточки, мс; по умолчанию — конец последнего слова. */
  endCardStartMs: z.number().optional(),
  brand: z
    .object({
      masthead: z.string(),
      eyebrow: z.string(),
      name: z.string(),
      cta: z.string(),
      sub: z.string(),
    })
    .default({
      masthead: 'TRINITY',
      eyebrow: 'Закрытый клуб · набор волнами',
      name: 'Золотая Литейная',
      cta: 't27.ai/foundry',
      sub: 'оплата в боте · @t27ai_bot',
    }),
});

type Props = z.infer<typeof NoirReelSchema>;

/** Зерно плёнки поверх футажа: статичная пыль + лёгкое мерцание кадра. */
const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const dots = React.useMemo(
    () =>
      Array.from({ length: 140 }, (_, i) => ({
        x: random(`nx${i}`) * width,
        y: random(`ny${i}`) * height,
        r: 0.6 + random(`nr${i}`) * 1.4,
        o: 0.03 + random(`no${i}`) * 0.06,
      })),
    [width, height]
  );
  const flicker = 0.97 + random(`fl${frame}`) * 0.03;
  return (
    <AbsoluteFill style={{ opacity: flicker }}>
      {dots.map((d, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: d.x,
            top: d.y,
            width: d.r,
            height: d.r,
            borderRadius: '50%',
            background: TEXT,
            opacity: d.o,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.55 }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse at center, transparent 46%, rgba(0,0,0,${strength}) 100%)`,
    }}
  />
);

/** Шапка как на главной: словомарка слева, метка клуба справа, волосяная линия. */
const Masthead: React.FC<{ masthead: string; label: string }> = ({ masthead, label }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [8, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: '52px 64px 26px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        borderBottom: `1px solid ${HAIRLINE}`,
        opacity: o,
      }}
    >
      <div style={{ fontFamily: outfit, fontWeight: 700, fontSize: 38, letterSpacing: 10, color: TEXT }}>
        {masthead}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT }} />
        <div style={{ fontFamily: outfit, fontWeight: 500, fontSize: 24, letterSpacing: 6, color: MUTED, textTransform: 'uppercase' }}>
          {label}
        </div>
      </div>
    </div>
  );
};

/** Пословные титры: Outfit 800, белый; слово-адрес — золотом. */
const Captions: React.FC<{ captions: Props['captions'] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const word = captions.find(c => ms >= c.startMs && ms < c.endMs);
  if (!word) return null;

  const isCta = /t27|\//i.test(word.text);
  const startFrame = Math.round((word.startMs / 1000) * fps);
  const pop = spring({ frame: frame - startFrame, fps, config: { damping: 200, stiffness: 380 } });
  const scale = 0.92 + pop * 0.08;

  return (
    <div
      style={{
        position: 'absolute',
        left: 40,
        right: 40,
        top: height * 0.66,
        textAlign: 'center',
        transform: `scale(${scale})`,
      }}
    >
      <span
        style={{
          fontFamily: outfit,
          fontWeight: 800,
          fontSize: isCta ? 76 : 92,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: isCta ? GOLDEN : TEXT,
          textShadow: '0 2px 24px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)',
        }}
      >
        {word.text}
      </span>
    </div>
  );
};

const rise = (frame: number, delay: number) => {
  const t = interpolate(frame - delay, [0, 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return { opacity: t, transform: `translateY(${(1 - t) * 18}px)` };
};

/** Финальная карточка — герой главной t27.ai: eyebrow, золотое имя, белая кнопка. */
const EndCard: React.FC<{ brand: Props['brand'] }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const bgIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{
        background: `rgba(0,0,0,${bgIn})`,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        gap: 34,
        padding: '0 72px',
        textAlign: 'center',
      }}
    >
      <div style={{ ...rise(frame, 6), width: 64, height: 3, background: ACCENT }} />
      <div
        style={{
          ...rise(frame, 10),
          fontFamily: outfit,
          fontWeight: 500,
          fontSize: 28,
          letterSpacing: 9,
          textTransform: 'uppercase',
          color: MUTED,
        }}
      >
        {brand.eyebrow}
      </div>
      <div
        style={{
          ...rise(frame, 16),
          fontFamily: outfit,
          fontWeight: 800,
          fontSize: 100,
          lineHeight: 1.06,
          color: GOLDEN,
        }}
      >
        {brand.name}
      </div>
      <div
        style={{
          ...rise(frame, 24),
          fontFamily: outfit,
          fontWeight: 700,
          fontSize: 42,
          color: BG,
          background: TEXT,
          borderRadius: 999,
          padding: '26px 58px',
          marginTop: 10,
        }}
      >
        {brand.cta}
      </div>
      <div
        style={{
          ...rise(frame, 32),
          fontFamily: outfit,
          fontWeight: 300,
          fontSize: 26,
          letterSpacing: 2,
          color: MUTED,
        }}
      >
        {brand.sub}
      </div>
    </AbsoluteFill>
  );
};

export const NoirReel: React.FC<Props> = props => {
  const { fps, durationInFrames } = useVideoConfig();
  const lastWordEnd = props.captions.length
    ? Math.max(...props.captions.map(c => c.endMs))
    : 0;
  const endCardStart = Math.round(
    (((props.endCardStartMs ?? lastWordEnd + 200) || 0) / 1000) * fps
  );
  const endCardFrames = Math.max(0, durationInFrames - endCardStart);

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {/* Футаж уже ч/б — grayscale здесь не ставим, он убил бы золотой значок */}
      <OffthreadVideo
        src={props.lipSyncVideo}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {props.cutaways.map((c, i) => (
        <Sequence key={i} from={c.startFrame} durationInFrames={c.durationFrames} name={`Cutaway ${i}`}>
          <OffthreadVideo
            src={c.src}
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'grayscale(1) contrast(1.1)',
            }}
          />
        </Sequence>
      ))}

      <Vignette />
      <Grain />
      <Masthead masthead={props.brand.masthead} label={props.brand.name} />
      <Captions captions={props.captions} />

      {endCardFrames > 0 ? (
        <Sequence from={endCardStart} durationInFrames={endCardFrames} name="End card">
          <EndCard brand={props.brand} />
        </Sequence>
      ) : null}

      {props.music ? <Audio src={props.music} volume={props.musicVolume} /> : null}
    </AbsoluteFill>
  );
};
