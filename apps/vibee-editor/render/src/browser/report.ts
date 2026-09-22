/**
 * "WHAT DID THE AGENT DO IN MY BROWSER?" -- ANSWERED IN THE PERSON'S CHAT.
 *
 * Owner, 2026-09-22: the links to watch the agent opened in a browser where
 * they were not signed in, so they saw nothing; "write a plain report of
 * every action, and a video after the agent has worked, for which task --
 * in clear language, with clear scientific images".
 *
 * So after every agent turn that touched the browser, the person gets, in
 * Telegram:
 *   1. a report shaped like a lab notebook -- the task (what was asked),
 *      the course of the experiment (every step, in order, in words), the
 *      observations (what the agent's eyes -- the vision model -- saw), the
 *      conclusion (the agent's own answer) and the instruments (how many
 *      steps, how long, how many failed);
 *   2. the film (film.ts): one frame of the whole screen per step.
 *
 * Built from the journal (journal.ts), so it can only say what the journal
 * kept: never what was typed, never a query string. Pure text building is
 * separate from sending, so the wording is tested without a network.
 */
import type { JournalRow } from './journal'
import { openBrowserButton } from './announce'

/** Telegram's limit for a message; the report stays under it. */
export const REPORT_MAX_CHARS = 3900
/** Telegram's limit for a caption. */
export const CAPTION_MAX_CHARS = 1000
/** How many steps the course of work lists before summing up the rest. */
export const REPORT_MAX_STEPS = 30

/* cyrillic-ok: every string below is user-facing report text */
const STEP_WORDS: Record<string, (d: Record<string, unknown>) => string> = {
  browser_open: d => `Открыл страницу ${host(d.url)}`, // cyrillic-ok
  browser_read: d =>
    `Прочитал текст страницы${typeof d.title === 'string' && d.title ? ` «${d.title}»` : ''}`, // cyrillic-ok
  browser_screenshot: () => 'Посмотрел на экран', // cyrillic-ok
  browser_click: d =>
    typeof d.what === 'string' && d.what
      ? `Нажал «${d.what}»` // cyrillic-ok
      : typeof d.x === 'number' && typeof d.y === 'number'
        ? `Нажал в точку (${d.x}, ${d.y})` // cyrillic-ok
        : 'Нажал на странице', // cyrillic-ok
  browser_type: d =>
    `Напечатал текст: ${Number(d.chars) || 0} симв. (сам текст не хранится)`, // cyrillic-ok
  browser_evaluate: d =>
    `Выполнил код на странице: ${Number(d.chars) || 0} симв.`, // cyrillic-ok
  browser_status: d =>
    typeof d.pages === 'number'
      ? `Проверил вкладки: открыто ${d.pages}` // cyrillic-ok
      : 'Проверил вкладки', // cyrillic-ok
  browser_close_tab: () => 'Закрыл вкладку', // cyrillic-ok
  browser_ask_permission: d =>
    `Попросил разрешения${typeof d.what === 'string' && d.what ? `: ${d.what}` : ''}`, // cyrillic-ok
}

function host(url: unknown): string {
  if (typeof url !== 'string' || !url) return '' // unknown address: say nothing
  try {
    const u = new URL(url)
    const path = u.pathname === '/' ? '' : u.pathname
    return `${u.host}${path}`.slice(0, 80)
  } catch {
    return String(url).slice(0, 80)
  }
}

/** One step in words. Pure. */
export function stepInWords(row: JournalRow): string {
  const d = row.detail ?? {}
  const say = STEP_WORDS[row.tool]?.(d) ?? row.tool
  if (!row.ok) {
    const why = typeof d.error === 'string' ? d.error.slice(0, 160) : ''
    return `⚠️ ${say} — не получилось${why ? `: ${why}` : ''}` // cyrillic-ok
  }
  return say
}

/*
 * Time since the first step, not a wall clock: the server does not know the
 * person's time zone, and "+0:42" reads the same everywhere.
 */
function sinceStart(iso: string, start: number): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t) || !Number.isFinite(start)) return ''
  const s = Math.max(0, Math.round((t - start) / 1000))
  return `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Russian plural form for n: one (1, 21), few (2-4, 22-24), many (5-20, 25). Pure. */
export function plural(
  n: number,
  one: string,
  few: string,
  many: string
): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b === 1) return one
  if (b >= 2 && b <= 4) return few
  return many
}

function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} с` // cyrillic-ok
  return `${Math.floor(s / 60)} мин ${s % 60} с` // cyrillic-ok
}

export interface ReportInput {
  /** This turn's steps, OLDEST FIRST. */
  steps: JournalRow[]
  /** What the person asked, in their words. */
  task: string
  /** What the agent answered at the end of the turn. */
  answer: string
  /** Frames in the film that follows, 0 when none is sent. */
  frames: number
}

/**
 * The lab notebook. Pure. Consecutive identical steps are one line with a
 * count, the same fold as the journal panel -- ten identical looks are one
 * observation repeated, not ten.
 */
export function workReport(input: ReportInput): string {
  const { steps, task, answer, frames } = input
  const lines: Array<{ at: string; text: string; times: number }> = []
  for (const s of steps) {
    const text = stepInWords(s)
    const prev = lines[lines.length - 1]
    if (prev && prev.text === text) {
      prev.times += 1
      continue
    }
    lines.push({ at: s.at, text, times: 1 })
  }
  const failed = steps.filter(s => !s.ok).length
  const seen: string[] = []
  for (const s of steps) {
    const v = s.detail?.seen
    if (typeof v === 'string' && v.trim() && !seen.includes(v.trim()))
      seen.push(v.trim())
  }
  const first = Date.parse(steps[0]?.at ?? '')
  const last = Date.parse(steps[steps.length - 1]?.at ?? '')
  const span =
    Number.isFinite(first) && Number.isFinite(last) ? last - first : 0

  const out: string[] = []
  out.push('🧪 Лабораторный журнал агента') // cyrillic-ok
  out.push('')
  out.push('🎯 Задача — что вы попросили проверить:') // cyrillic-ok
  out.push(task.trim().slice(0, 400) || '—')
  out.push('')
  out.push('🔬 Ход опыта — каждое действие по порядку:') // cyrillic-ok
  lines.slice(0, REPORT_MAX_STEPS).forEach((l, i) => {
    const count = l.times > 1 ? ` ×${l.times}` : ''
    out.push(`${i + 1}. ${sinceStart(l.at, first)} ${l.text}${count}`)
  })
  if (lines.length > REPORT_MAX_STEPS)
    out.push(
      `… и ещё ${lines.length - REPORT_MAX_STEPS} ${plural(lines.length - REPORT_MAX_STEPS, 'шаг', 'шага', 'шагов')}` // cyrillic-ok
    )
  if (seen.length) {
    out.push('')
    out.push('👁 Наблюдения — что агент увидел на экране своими «глазами»:') // cyrillic-ok
    for (const v of seen.slice(0, 4)) out.push(`• ${v.slice(0, 240)}`)
  }
  out.push('')
  out.push('✅ Вывод агента:') // cyrillic-ok
  out.push(answer.trim().slice(0, 900) || '— (агент не написал ответа)') // cyrillic-ok
  out.push('')
  out.push(
    `📏 Приборы: шагов ${steps.length}, время ${duration(span)}, ошибок ${failed}` + // cyrillic-ok
      (frames ? `, кадров в записи ${frames}` : '') // cyrillic-ok
  )
  out.push(
    'Как в настоящем журнале опыта: записан каждый шаг, но не то, что вводили вы, — ' + // cyrillic-ok
      'пароли и набранный текст не хранятся, только их длина.' // cyrillic-ok
  )
  const text = out.join('\n')
  return text.length > REPORT_MAX_CHARS
    ? text.slice(0, REPORT_MAX_CHARS - 1) + '…'
    : text
}

/**
 * The person's words from a chat message: a string, or the text parts of a
 * multimodal one (a picture is not a task). Pure.
 */
export function taskText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content))
    return content
      .map(p =>
        p &&
        typeof p === 'object' &&
        typeof (p as { text?: unknown }).text === 'string'
          ? (p as { text: string }).text
          : ''
      )
      .filter(Boolean)
      .join(' ')
  return ''
}

/** The caption under the film. Pure. */
export function filmCaption(frames: number): string {
  return (
    `🎞 Запись работы агента: ${frames} ${plural(frames, 'кадр', 'кадра', 'кадров')} — ` + // cyrillic-ok
    'экран каждые 2 секунды, пока агент работал, и после каждого его шага; ' + // cyrillic-ok
    'зелёный круг — куда он нажал. ' + // cyrillic-ok
    'Как покадровая съёмка в лаборатории: быстрый процесс, разложенный на мгновения.'
  ) // cyrillic-ok
    .slice(0, CAPTION_MAX_CHARS)
}

export interface ReportDeps {
  /** The journal, newest first (readJournal). */
  readSteps: () => Promise<JournalRow[]>
  sendText: (text: string, replyMarkup?: unknown) => Promise<void>
  sendVideo: (mp4: Buffer, caption: string) => Promise<void>
  /** The film of this turn, or null. Called once. */
  film: () => Promise<{ mp4: Buffer | null; frames: number }>
  /** Waits for the last journal writes to land (they are not awaited). */
  settle?: () => Promise<void>
}

/**
 * After a turn: report when the turn touched the browser, stay silent when it
 * did not. Never throws -- a report is owed to the person, but its failure
 * must not become an error in the conversation they are reading.
 */
export async function reportBrowserWork(
  deps: ReportDeps,
  turn: { since: number; task: string; answer: string }
): Promise<'silent' | 'sent' | 'failed'> {
  try {
    await (deps.settle ?? (() => new Promise(r => setTimeout(r, 3000))))()
    const steps = (await deps.readSteps())
      .filter(s => Date.parse(s.at) >= turn.since)
      .reverse()
    if (steps.length === 0) return 'silent'
    const { mp4, frames } = await deps.film()
    const text = workReport({
      steps,
      task: turn.task,
      answer: turn.answer,
      frames: mp4 ? frames : 0,
    })
    await deps.sendText(text, {
      inline_keyboard: [[openBrowserButton('🌐 Открыть мой браузер')]], // cyrillic-ok
    })
    if (mp4) await deps.sendVideo(mp4, filmCaption(frames))
    return 'sent'
  } catch (e) {
    console.warn('[browser] work report not sent:', String(e).slice(0, 200))
    return 'failed'
  }
}
