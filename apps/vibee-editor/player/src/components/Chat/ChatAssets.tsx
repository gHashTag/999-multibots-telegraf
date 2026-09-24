/**
 * АССЕТЫ В СООБЩЕНИЯХ ЧАТА.
 *
 * Агент отвечает ссылками на файлы (S3/рендеры), и голая ссылка — это
 * неуважение к человеку: он видит строку на 120 символов вместо готовой
 * работы. Этот компонент превращает ссылки в живые превью:
 *   картинка → превью (клик — оригинал в новой вкладке),
 *   видео   → встроенный плеер,
 *   аудио   → встроенный плеер.
 *
 * Модель пишет markdown, и это надо уважать, а не показывать сырьём:
 * ![alt](url) — картинка, **жирный**, `код`. Сегментация идёт по убыванию
 * жадности: сначала markdown-картинки, потом инлайн-код (внутри него URL
 * не трогаем), потом медиа-ссылки, остальное — текст.
 */
import { useState, type ReactNode } from 'react'
import './ChatAssets.css'

type Segment =
  | { kind: 'text'; content: string }
  | { kind: 'code'; content: string }
  | { kind: 'image'; url: string }
  | { kind: 'video'; url: string }
  | { kind: 'audio'; url: string }
  | { kind: 'link'; url: string }

/**
 * HEIC/HEIF/AVIF -- NOT A RARE EDGE CASE, THE ORDINARY PATH FROM AN IPHONE.
 *
 * iPhone stores photos as HEIC by default, and not every way of attaching a
 * file to the mini app (AirDrop, Files, the Telegram WebView itself)
 * converts it to JPEG along the way. Without these extensions the preview
 * stayed silent exactly where people expect it most: a photo just taken on
 * the phone. This list is kept in sync with the server's `/s3/` proxy
 * (render-server.ts) -- the same confusion there once sent a HEIC photo
 * down the "this must be video, run it through ffmpeg" branch, and got
 * nothing back.
 */
const IMAGE_RE = /\.(jpe?g|png|webp|gif|heic|heif|avif|svg|bmp)(\?|$)/i
/**
 * `.webm` IS AUDIO ONLY. The mini app's voice recorder (`useAudioRecorder.ts`)
 * writes `audio/webm`, the only source of .webm in this chat: the app never
 * generates or accepts video in that format. `.webm` used to sit in
 * VIDEO_RE instead -- a voice message rendered as a silent black video
 * player with no frame at all, because the container held no video.
 */
const VIDEO_RE = /\.(mp4|mov|m4v)(\?|$)/i
const AUDIO_RE = /\.(mp3|wav|m4a|ogg|webm|opus|flac)(\?|$)/i
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g
/** markdown-картинка ![alt](url) — до всего остального, иначе alt останется в тексте */
const MD_IMAGE_RE = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g
/** инлайн-код `…` — внутри него разметка не разбирается */
const INLINE_CODE_RE = /`([^`\n]+)`/g

function classify(url: string): Segment | null {
  if (IMAGE_RE.test(url)) return { kind: 'image', url }
  if (VIDEO_RE.test(url)) return { kind: 'video', url }
  if (AUDIO_RE.test(url)) return { kind: 'audio', url }
  return null
}

/** Текст → чередование текста, кода и ассетов/ссылок. */
function splitSegments(text: string): Segment[] {
  const segments: Segment[] = []
  // Комбинированный сканер: на каждой позиции пробуем паттерны по очереди.
  const patterns: [RegExp, (m: RegExpExecArray) => Segment | null][] = [
    [MD_IMAGE_RE, m => ({ kind: 'image', url: m[1] })],
    [INLINE_CODE_RE, m => ({ kind: 'code', content: m[1] })],
  ]
  let i = 0
  let plain = ''
  while (i < text.length) {
    const rest = text.slice(i)
    let matched: Segment | null = null
    let matchLen = 0
    for (const [re, toSegment] of patterns) {
      re.lastIndex = 0
      const m = re.exec(rest)
      // Паттерн должен начаться в текущей позиции, а не где-то дальше:
      // иначе текст между сюда и совпадением попадёт в «plain» по факту.
      if (m && m.index === 0) {
        const seg = toSegment(m)
        if (seg) {
          matched = seg
          matchLen = m[0].length
          break
        }
      }
    }
    if (matched) {
      // Медиа-ссылки в обычном тексте ловим посимвольно тем же проходом
      if (plain) {
        pushWithMedia(segments, plain)
        plain = ''
      }
      segments.push(matched)
      i += matchLen
    } else {
      // Быстрая проверка: не начинается ли здесь обычный URL
      const urlAt = rest.match(/^https?:\/\/[^\s<>"')\]]+/)
      if (urlAt) {
        const seg = classify(urlAt[0])
        if (seg) {
          if (plain) {
            pushWithMedia(segments, plain)
            plain = ''
          }
          segments.push(seg)
          i += urlAt[0].length
          continue
        }
      }
      plain += text[i]
      i++
    }
  }
  if (plain) pushWithMedia(segments, plain)
  return segments
}

/** Хвостовой текст: обычные (не-медиа) ссылки делаем кликабельными. */
function pushWithMedia(segments: Segment[], text: string) {
  let last = 0
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
    if (m.index > last)
      segments.push({ kind: 'text', content: text.slice(last, m.index) })
    segments.push({ kind: 'link', url: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length)
    segments.push({ kind: 'text', content: text.slice(last) })
}

/** Короткая человекочитаемая подпись ссылки: домен + хвост. */
function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    const tail = u.pathname.split('/').filter(Boolean).slice(-1)[0] || ''
    const short = tail.length > 18 ? tail.slice(0, 15) + '…' : tail
    return `${u.hostname}/${short}`
  } catch {
    return url
  }
}

/** Фрагмент текста: **жирный** и обычные (не-медиа) ссылки. */
function TextPart({ content }: { content: string }) {
  const parts = content.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
  return (
    <>
      {parts.map((p, i) => {
        const bold = p.match(/^\*\*([^*]+)\*\*$/)
        if (bold) return <strong key={i}>{bold[1]}</strong>
        const chunks = p.split(/(https?:\/\/[^\s<>"')\]]+)/g)
        return (
          <span key={i}>
            {chunks.map((chunk, j) =>
              j % 2 === 1 ? (
                <a
                  key={j}
                  href={chunk}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {shortUrl(chunk)}
                </a>
              ) : (
                chunk
              )
            )}
          </span>
        )
      })}
    </>
  )
}

/**
 * Блок текста ПОСТРОЧНО: заголовки, списки, абзацы.
 *
 * Раньше весь ответ агента шёл одним `<p>`, и разметка оставалась сырой:
 * человек видел на экране «## 1. Производство (платно)» и «- Нарисовать
 * картинку» вместе со звёздочками и решётками. Жирный при этом работал —
 * поэтому выглядело как поломка, а не как отсутствие поддержки.
 *
 * Полноценный markdown сюда не нужен и вреден: агент пишет короткими
 * списками и подзаголовками, а таблицы и цитаты в чате не появляются.
 * Разбираем ровно то, что он действительно шлёт.
 */
function TextBlock({ content }: { content: string }) {
  const lines = content.split('\n')
  const out: ReactNode[] = []
  let bullets: string[] = []

  const flush = () => {
    if (!bullets.length) return
    out.push(
      <ul key={`ul${out.length}`} className="chat-assets__list">
        {bullets.map((b, i) => (
          <li key={i}>
            <TextPart content={b} />
          </li>
        ))}
      </ul>
    )
    bullets = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    if (heading) {
      flush()
      out.push(
        <p key={`h${out.length}`} className="chat-assets__heading">
          <TextPart content={heading[1]} />
        </p>
      )
      continue
    }
    // Маркер списка: «- », «* », «• » или «1. ». Номер сохраняем в тексте —
    // агент нумерует осмысленно, и своя нумерация браузера с ней разошлась бы.
    const bullet = line.match(/^(?:[-*•]\s+|\d+[.)]\s+)(.*)$/)
    if (bullet) {
      const num = line.match(/^(\d+[.)])\s+/)
      bullets.push(num ? `${num[1]} ${bullet[1]}` : bullet[1])
      continue
    }
    flush()
    out.push(
      <p key={`p${out.length}`} className="chat-assets__text">
        <TextPart content={line} />
      </p>
    )
  }
  flush()
  return <>{out}</>
}

/**
 * An image that can ADMIT it failed to load.
 *
 * A bare `<img>` used to sit here: the extension matched, so it must be an
 * image -- and if the link had expired since (a signed S3 URL) or the
 * server answered with something else, the browser silently draws a broken
 * icon forever. The person sees the same breakage as when there was no
 * preview to begin with, with no way to tell them apart -- and there is a
 * difference: one had nothing to show, the other failed to show it. The
 * second case can at least fall back to a working link to the original.
 */
function ImageAsset({ url }: { url: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return (
      <a
        className="chat-assets__link"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {shortUrl(url)}
      </a>
    )
  }
  return (
    <a
      className="chat-assets__image-link"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="Открыть оригинал"
    >
      <img
        className="chat-assets__image"
        src={url}
        alt="Сгенерированный файл"
        loading="lazy"
        onError={() => setBroken(true)}
      />
    </a>
  )
}

/**
 * A PLAYER THAT CAN ADMIT IT FAILED, for the same reason the image can.
 *
 * `ImageAsset` learned this when a signed S3 link expired; the player was
 * left as a bare `<video>` and kept the failure. A source the browser cannot
 * open leaves the element standing -- measured in the pane: 152px of BLACK
 * with a dead control bar, and up to `max-height: 420px` once a vertical
 * reel has reported its size. On a phone that is a third of the screen
 * saying nothing, and the person cannot tell "nothing to show" from "failed
 * to show it". The second case still has a working link to the original.
 *
 * The audio element gets it too: 44px of dead control bar is smaller but no
 * more honest.
 */
function PlayerAsset({ url, kind }: { url: string; kind: 'video' | 'audio' }) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return (
      <a
        className="chat-assets__link"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {shortUrl(url)}
      </a>
    )
  }
  if (kind === 'video') {
    return (
      <video
        className="chat-assets__video"
        src={url}
        controls
        playsInline
        preload="metadata"
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <audio
      className="chat-assets__audio"
      src={url}
      controls
      preload="metadata"
      onError={() => setBroken(true)}
    />
  )
}

export function ChatAssets({ text }: { text: string }) {
  const segments = splitSegments(text)
  if (!segments.length) return null
  return (
    <div className="chat-assets">
      {segments.map((s, i) => {
        if (s.kind === 'text') {
          const trimmed = s.content.replace(/^\s+|\s+$/g, '')
          if (!trimmed) return null
          return <TextBlock key={i} content={trimmed} />
        }
        if (s.kind === 'code') {
          return (
            <code key={i} className="chat-assets__code">
              {s.content}
            </code>
          )
        }
        if (s.kind === 'link') {
          return (
            <a
              key={i}
              className="chat-assets__link"
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {shortUrl(s.url)}
            </a>
          )
        }
        if (s.kind === 'image') {
          return <ImageAsset key={i} url={s.url} />
        }
        if (s.kind === 'video') {
          return <PlayerAsset key={i} url={s.url} kind="video" />
        }
        return <PlayerAsset key={i} url={s.url} kind="audio" />
      })}
    </div>
  )
}
