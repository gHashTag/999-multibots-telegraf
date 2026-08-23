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
import './ChatAssets.css'

type Segment =
  | { kind: 'text'; content: string }
  | { kind: 'code'; content: string }
  | { kind: 'image'; url: string }
  | { kind: 'video'; url: string }
  | { kind: 'audio'; url: string }
  | { kind: 'link'; url: string }

const IMAGE_RE = /\.(jpe?g|png|webp|gif)(\?|$)/i
const VIDEO_RE = /\.(mp4|webm|mov)(\?|$)/i
const AUDIO_RE = /\.(mp3|wav|m4a|ogg)(\?|$)/i
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
    if (m.index > last) segments.push({ kind: 'text', content: text.slice(last, m.index) })
    segments.push({ kind: 'link', url: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length) segments.push({ kind: 'text', content: text.slice(last) })
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
                <a key={j} href={chunk} target="_blank" rel="noopener noreferrer">
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

export function ChatAssets({ text }: { text: string }) {
  const segments = splitSegments(text)
  if (!segments.length) return null
  return (
    <div className="chat-assets">
      {segments.map((s, i) => {
        if (s.kind === 'text') {
          const trimmed = s.content.replace(/^\s+|\s+$/g, '')
          if (!trimmed) return null
          return (
            <p key={i} className="chat-assets__text">
              <TextPart content={trimmed} />
            </p>
          )
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
          return (
            <a
              key={i}
              className="chat-assets__image-link"
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Открыть оригинал"
            >
              <img
                className="chat-assets__image"
                src={s.url}
                alt="Сгенерированный файл"
                loading="lazy"
              />
            </a>
          )
        }
        if (s.kind === 'video') {
          return (
            <video
              key={i}
              className="chat-assets__video"
              src={s.url}
              controls
              playsInline
              preload="metadata"
            />
          )
        }
        return (
          <audio key={i} className="chat-assets__audio" src={s.url} controls preload="metadata" />
        )
      })}
    </div>
  )
}
