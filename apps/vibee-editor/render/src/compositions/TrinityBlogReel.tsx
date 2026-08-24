import React from 'react'
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  random,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { z } from 'zod'
import { loadFont as loadPlayfair } from '@remotion/google-fonts/PlayfairDisplay'
import { loadFont as loadCormorant } from '@remotion/google-fonts/Cormorant'

/**
 * TrinityBlogReel — фирменный стиль рилсов для блога t27.ai.
 *
 * Идентика перенесена с обложек корпуса (skill canon-cover-style), а не
 * придумана заново. Отсюда три жёстких правила, которые нельзя нарушать:
 *
 *   1. Фон — матовый чёрный #0A0A0A с зерном. НЕ чистый #000, не синий.
 *   2. ЗОЛОТО #C9A24B — ТОЛЬКО заголовок поста. Всё остальное на экране —
 *      кремово-серебряное #D8CDB0. Ни одного третьего цвета.
 *   3. Только барочная антиква (Playfair/Cormorant). Никакого гротеска,
 *      неона, свечения, эмодзи.
 *
 * Отличие от промо-рилса (SplitTalkingHead): там неон, жёлтые титры и фонк —
 * это стиль личного блога-витрины. Здесь — научная витрина: гравюра, тишина,
 * измеренные числа. Один пост = один рилс.
 */

const { fontFamily: playfair } = loadPlayfair('normal', {
  weights: ['700', '900'],
  subsets: ['cyrillic', 'latin'],
})
const { fontFamily: cormorant } = loadCormorant('normal', {
  weights: ['400', '600', '700'],
  subsets: ['cyrillic', 'latin'],
})

const GOLD = '#C9A24B'
const CREAM = '#D8CDB0'
const BG = '#0A0A0A'

/**
 * Надписи шаблона. В русской версии по-русски ВСЁ, что пишем мы, — иначе
 * получается солянка: русская озвучка, русский вывод и английская шапка.
 * Заголовок поста не переводим: он приходит из блога как есть.
 */
const UI = {
  // Имя компании КАНОНИЧНО и не переводится: Trinity S³AI на обоих языках.
  // Прежняя русская «ТРОИЦА» была переводом названия — так у компании
  // появлялось два имени, и материалы переставали читаться как одно издание.
  ru: {
    masthead: 'Trinity S³AI',
    min: 'мин',
    read: 'чтения',
    ribbon: 'Trinity S³AI — измерено, не заявлено',
  },
  en: {
    masthead: 'Trinity S³AI',
    min: 'min',
    read: 'read',
    ribbon: 'Trinity S³AI — measured, not claimed',
  },
} as const

export const TrinityBlogReelSchema = z.object({
  /**
   * Язык надписей шаблона (шапка, подписи табличек, колофон). Заголовок и
   * подзаголовок идут как есть — их язык задаёт сам пост.
   */
  lang: z.enum(['ru', 'en']).default('ru'),
  /** Заголовок поста — ЕДИНСТВЕННЫЙ золотой элемент. */
  title: z.string(),
  /** Одна строка сути, кремовая. */
  subtitle: z.string(),
  /** «2026-08-21 · 6 min». */
  dateline: z.string(),
  /** Рубрики поста: Measurement · FPGA · Self-critique. */
  tags: z.array(z.string()),
  /** Гравированные таблички с измеренными числами. */
  plates: z.array(z.object({ label: z.string(), value: z.string() })),
  /** Вывод поста — то, чему случай научил. */
  lesson: z.string(),
  /** Инвариант на ленте аутро. */
  invariant: z.string().default(''),
  url: z.string(),
  year: z.string(),
  /**
   * Продажа входа в клуб — последний экран перед колофоном.
   *
   * Имя клуба здесь получает золото: в этом акте оно работает как заголовок,
   * а правило канона — «одно золотое на экране», а не «золото раз в ролик».
   * Заголовок поста к этому моменту уже ушёл, так что двух золотых рядом нет.
   */
  club: z
    .object({
      name: z.string(),
      tagline: z.string(),
      terms: z.string(),
      cta: z.string(),
    })
    .optional(),
  /** Необязательный говорящий аватар в овальном медальоне (монохром). */
  avatarVideo: z.string().optional(),
  voiceover: z.string().optional(),
  music: z.string().optional(),
  musicVolume: z.number().default(0.05),
  captions: z
    .array(
      z.object({ text: z.string(), startMs: z.number(), endMs: z.number() })
    )
    .default([]),
})

type Props = z.infer<typeof TrinityBlogReelSchema>

/** Матовый чёрный с зерном: чистый #000 в каноне запрещён. */
const Paper: React.FC = () => {
  const { width, height } = useVideoConfig()
  const dots = React.useMemo(
    () =>
      Array.from({ length: 160 }, (_, i) => ({
        x: random(`gx${i}`) * width,
        y: random(`gy${i}`) * height,
        r: 0.6 + random(`gr${i}`) * 1.6,
        o: 0.02 + random(`go${i}`) * 0.05,
      })),
    [width, height]
  )
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
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
            background: CREAM,
            opacity: d.o,
          }}
        />
      ))}
    </AbsoluteFill>
  )
}

/** Барочная рамка: прорисовывается штрихом, как на гравюре. */
const Frame: React.FC<{ inset?: number }> = ({ inset = 54 }) => {
  const frame = useCurrentFrame()
  const draw = interpolate(frame, [0, 26], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const line = (s: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    background: CREAM,
    opacity: 0.42,
    ...s,
  })
  return (
    <AbsoluteFill>
      <div
        style={line({
          left: inset,
          right: inset,
          top: inset,
          height: 1,
          transform: `scaleX(${draw})`,
        })}
      />
      <div
        style={line({
          left: inset,
          right: inset,
          bottom: inset,
          height: 1,
          transform: `scaleX(${draw})`,
        })}
      />
      <div
        style={line({
          top: inset,
          bottom: inset,
          left: inset,
          width: 1,
          transform: `scaleY(${draw})`,
        })}
      />
      <div
        style={line({
          top: inset,
          bottom: inset,
          right: inset,
          width: 1,
          transform: `scaleY(${draw})`,
        })}
      />
      {/* угловые засечки — деталь гравированной рамки */}
      {[
        { top: inset + 14, left: inset + 14 },
        { top: inset + 14, right: inset + 14 },
        { bottom: inset + 14, left: inset + 14 },
        { bottom: inset + 14, right: inset + 14 },
      ].map((pos, i) => (
        <div
          key={i}
          style={line({ ...pos, width: 26, height: 1, opacity: 0.3 * draw })}
        />
      ))}
    </AbsoluteFill>
  )
}

/** Появление: только сдвиг и прозрачность. Ни зума, ни свечения. */
const rise = (frame: number, delay: number) => {
  const t = interpolate(frame - delay, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return { opacity: t, transform: `translateY(${(1 - t) * 16}px)` }
}

const Rule: React.FC<{ width: number; delay: number }> = ({ width, delay }) => {
  const frame = useCurrentFrame()
  const w = interpolate(frame - delay, [0, 22], [0, width], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <div
      style={{
        width: w,
        height: 1,
        background: CREAM,
        opacity: 0.5,
        margin: '26px 0',
      }}
    />
  )
}

/** Сцена 1: лента издания, дата, рубрики. */
const SceneMasthead: React.FC<Props> = ({ dateline, tags, lang }) => {
  const frame = useCurrentFrame()
  const ui = UI[lang]
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          ...rise(frame, 4),
          fontFamily: cormorant,
          fontWeight: 600,
          fontSize: 40,
          letterSpacing: 20,
          color: CREAM,
          textTransform: 'uppercase',
        }}
      >
        {ui.masthead}
      </div>
      <Rule width={420} delay={12} />
      <div
        style={{
          ...rise(frame, 20),
          fontFamily: cormorant,
          fontSize: 34,
          color: CREAM,
          opacity: 0.85,
          letterSpacing: 3,
        }}
      >
        {dateline}
      </div>
      <div
        style={{
          ...rise(frame, 30),
          marginTop: 26,
          display: 'flex',
          gap: 18,
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: 820,
        }}
      >
        {tags.map(t => (
          <span
            key={t}
            style={{
              fontFamily: cormorant,
              fontSize: 28,
              color: CREAM,
              opacity: 0.75,
              border: `1px solid ${CREAM}55`,
              borderRadius: 2,
              padding: '6px 16px',
              letterSpacing: 2,
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  )
}

/** Сцена 2: ЗОЛОТОЙ заголовок — единственное золото во всём ролике. */
const SceneTitle: React.FC<Props> = ({ title, subtitle }) => {
  const frame = useCurrentFrame()
  const words = title.split(' ')
  // Авторегресс размера: плашка шириной 860px (1080 − поля 110×2), Playfair
  // italic ≈ 0.6em на символ + межсловный отступ. Считаем по САМОМУ ДЛИННОМУ
  // слову и общей длине — иначе заголовок вылезал за плашку и резался
  // (замерено на посте «Агент, который не советует…»).
  const longest = words.reduce((m, w) => Math.max(m, w.length), 0)
  const byLongest = Math.floor(860 / Math.max(longest * 0.62, 1))
  const byTotal = title.length > 46 ? 92 : 108
  const titleSize = Math.max(44, Math.min(byTotal, byLongest))
  const subSize = subtitle.length > 120 ? 30 : subtitle.length > 70 ? 35 : 40
  return (
    <AbsoluteFill
      style={{ justifyContent: 'center', alignItems: 'center', padding: 110 }}
    >
      <div
        style={{
          fontFamily: playfair,
          fontWeight: 900,
          fontStyle: 'italic',
          fontSize: titleSize,
          lineHeight: 1.1,
          textAlign: 'center',
          color: GOLD,
          maxWidth: 860,
        }}
      >
        {words.map((w, i) => (
          <span
            key={i}
            style={{
              display: 'inline-block',
              marginRight: 18,
              ...rise(frame, 6 + i * 4),
            }}
          >
            {w}
          </span>
        ))}
      </div>
      <Rule width={300} delay={6 + words.length * 4} />
      <div
        style={{
          ...rise(frame, 14 + words.length * 4),
          fontFamily: cormorant,
          fontSize: subSize,
          lineHeight: 1.35,
          textAlign: 'center',
          color: CREAM,
          opacity: 0.9,
          maxWidth: 820,
        }}
      >
        {subtitle}
      </div>
    </AbsoluteFill>
  )
}

/** Сцена 3: гравированные таблички с измеренными числами. */
const ScenePlates: React.FC<Props> = ({ plates }) => {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill
      style={{ justifyContent: 'center', alignItems: 'center', gap: 34 }}
    >
      {plates.map((p, i) => {
        const st = rise(frame, 6 + i * 16)
        return (
          <div
            key={i}
            style={{
              ...st,
              width: 760,
              border: `1px solid ${CREAM}66`,
              padding: '30px 40px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: cormorant,
                fontSize: 30,
                letterSpacing: 5,
                color: CREAM,
                opacity: 0.7,
                textTransform: 'uppercase',
              }}
            >
              {p.label}
            </div>
            <div
              style={{
                fontFamily: playfair,
                fontWeight: 700,
                fontSize: 74,
                color: CREAM,
                marginTop: 10,
              }}
            >
              {p.value}
            </div>
          </div>
        )
      })}
    </AbsoluteFill>
  )
}

/** Сцена 4: вывод — то, чему случай научил. */
const SceneLesson: React.FC<Props> = ({ lesson }) => {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill
      style={{ justifyContent: 'center', alignItems: 'center', padding: 120 }}
    >
      <div
        style={{
          ...rise(frame, 4),
          fontFamily: cormorant,
          fontStyle: 'italic',
          fontSize: 58,
          lineHeight: 1.4,
          textAlign: 'center',
          color: CREAM,
        }}
      >
        {lesson}
      </div>
    </AbsoluteFill>
  )
}

/** Сцена 5: вход в клуб. Единственный экран, который что-то продаёт. */
const SceneClub: React.FC<Props> = ({ club }) => {
  const frame = useCurrentFrame()
  if (!club) return null
  return (
    <AbsoluteFill
      style={{ justifyContent: 'center', alignItems: 'center', padding: 100 }}
    >
      <div
        style={{
          ...rise(frame, 2),
          fontFamily: cormorant,
          fontSize: 30,
          letterSpacing: 10,
          color: CREAM,
          opacity: 0.72,
          textTransform: 'uppercase',
        }}
      >
        {club.tagline}
      </div>
      <div
        style={{
          ...rise(frame, 10),
          fontFamily: playfair,
          fontWeight: 900,
          fontStyle: 'italic',
          fontSize: 96,
          lineHeight: 1.08,
          textAlign: 'center',
          color: GOLD,
          marginTop: 18,
        }}
      >
        {club.name}
      </div>
      <Rule width={360} delay={20} />
      <div
        style={{
          ...rise(frame, 26),
          fontFamily: cormorant,
          fontSize: 38,
          lineHeight: 1.35,
          textAlign: 'center',
          color: CREAM,
          maxWidth: 780,
          opacity: 0.92,
        }}
      >
        {club.terms}
      </div>
      <div
        style={{
          ...rise(frame, 36),
          marginTop: 46,
          border: `1px solid ${CREAM}88`,
          padding: '20px 46px',
          fontFamily: cormorant,
          fontWeight: 700,
          fontSize: 40,
          letterSpacing: 4,
          color: CREAM,
          textTransform: 'uppercase',
        }}
      >
        {club.cta}
      </div>
    </AbsoluteFill>
  )
}

/** Сцена 6: лента, адрес, год. */
const SceneColophon: React.FC<Props> = ({ invariant, url, year, lang }) => {
  const frame = useCurrentFrame()
  // invariant задан явно — уважаем его; иначе берём фразу издания на языке ролика.
  const ribbon = invariant ? `Trinity S³AI — ${invariant}` : UI[lang].ribbon
  return (
    <AbsoluteFill
      style={{ justifyContent: 'center', alignItems: 'center', padding: 110 }}
    >
      <div
        style={{
          ...rise(frame, 4),
          fontFamily: cormorant,
          fontSize: 36,
          letterSpacing: 4,
          textAlign: 'center',
          color: CREAM,
          maxWidth: 780,
          opacity: 0.9,
        }}
      >
        {ribbon}
      </div>
      <Rule width={460} delay={12} />
      <div
        style={{
          ...rise(frame, 18),
          fontFamily: playfair,
          fontWeight: 700,
          fontSize: 62,
          color: CREAM,
        }}
      >
        {url}
      </div>
      <div
        style={{
          ...rise(frame, 28),
          marginTop: 34,
          fontFamily: cormorant,
          fontSize: 30,
          letterSpacing: 8,
          color: CREAM,
          opacity: 0.7,
        }}
      >
        {year}
      </div>
    </AbsoluteFill>
  )
}

/**
 * Аватар в овальном медальоне: монохром, кремовая гравированная оправа.
 *
 * Монохром здесь не украшение, а требование канона: цветное видео принесло бы
 * на экран третий цвет и сломало правило «золото только на заголовке».
 */
const Medallion: React.FC<{ src: string }> = ({ src }) => {
  const frame = useCurrentFrame()
  const t = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 150,
      }}
    >
      <div
        style={{
          width: 480,
          height: 610,
          borderRadius: '50%',
          overflow: 'hidden',
          border: `1px solid ${CREAM}99`,
          boxShadow: `0 0 0 8px ${BG}, 0 0 0 9px ${CREAM}44`,
          opacity: t,
        }}
      >
        {src.match(/\.(mp4|webm|mov)$/i) ? (
          <OffthreadVideo
            src={src}
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'grayscale(1) contrast(1.15) brightness(0.95)',
            }}
          />
        ) : (
          <Img
            src={src}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'grayscale(1) contrast(1.15)',
            }}
          />
        )}
      </div>
    </AbsoluteFill>
  )
}

/** Титры: кремовые, барочные, по одному слову — как гравированная подпись. */
const Caption: React.FC<{ captions: Props['captions'] }> = ({ captions }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const t = (frame / fps) * 1000
  const cur = captions.find(c => t >= c.startMs && t < c.endMs)
  if (!cur) return null
  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 110,
      }}
    >
      <div
        style={{
          fontFamily: cormorant,
          fontWeight: 700,
          fontSize: 56,
          letterSpacing: 6,
          color: CREAM,
          textTransform: 'uppercase',
          textShadow: `0 2px 18px ${BG}`,
        }}
      >
        {cur.text}
      </div>
    </AbsoluteFill>
  )
}

export const TrinityBlogReel: React.FC<Props> = props => {
  const { durationInFrames } = useVideoConfig()
  // Пять актов. Доли подобраны под 30 секунд и масштабируются вместе с длиной.
  const d = durationInFrames
  // Клубный экран вставляется только если клуб задан — иначе доли те же,
  // что и раньше, и старые пропсы продолжают рендериться без правок.
  const acts = props.club
    ? [
        { at: 0, len: Math.round(d * 0.09), C: SceneMasthead },
        { at: Math.round(d * 0.09), len: Math.round(d * 0.23), C: SceneTitle },
        { at: Math.round(d * 0.32), len: Math.round(d * 0.26), C: ScenePlates },
        { at: Math.round(d * 0.58), len: Math.round(d * 0.17), C: SceneLesson },
        { at: Math.round(d * 0.75), len: Math.round(d * 0.17), C: SceneClub },
        {
          at: Math.round(d * 0.92),
          len: d - Math.round(d * 0.92),
          C: SceneColophon,
        },
      ]
    : [
        { at: 0, len: Math.round(d * 0.1), C: SceneMasthead },
        { at: Math.round(d * 0.1), len: Math.round(d * 0.26), C: SceneTitle },
        { at: Math.round(d * 0.36), len: Math.round(d * 0.3), C: ScenePlates },
        { at: Math.round(d * 0.66), len: Math.round(d * 0.22), C: SceneLesson },
        {
          at: Math.round(d * 0.88),
          len: d - Math.round(d * 0.88),
          C: SceneColophon,
        },
      ]
  return (
    <AbsoluteFill>
      <Paper />
      <Frame />
      {acts.map(({ at, len, C }, i) => (
        <Sequence key={i} from={at} durationInFrames={len}>
          <C {...props} />
        </Sequence>
      ))}
      {props.avatarVideo ? (
        <Sequence
          from={acts[2].at}
          durationInFrames={acts[2].len + acts[3].len}
        >
          <Medallion src={props.avatarVideo} />
        </Sequence>
      ) : null}
      <Caption captions={props.captions} />
      {props.voiceover ? <Audio src={props.voiceover} /> : null}
      {props.music ? (
        <Audio src={props.music} volume={props.musicVolume} />
      ) : null}
    </AbsoluteFill>
  )
}
