/**
 * "I OPENED THE PAGE" -- WITHOUT OPENING ANYTHING.
 *
 * 2026-09-22, tri a2a: asked to sign into X, the agent answered in 11
 * seconds with zero tool calls -- and described a whole session: "opening
 * the login page", "taking a screenshot", "the Google button is in the DOM
 * at zero size". None of it happened. The next invented session, the same
 * day, had ONE refused click and a paragraph of "opening the page, taking a
 * screenshot, reading the page, checking the tabs" -- so each claimed action
 * is matched to the tool that would have done it, not to "any tool at all".
 *
 * The streamed words cannot be taken back, so the turn ends with a plain
 * note saying so, stored with the answer: the person is not misled, and the
 * model sees its own mistake in the history of the next turn.
 *
 * Deliberately narrow: first-person present or past actions IN the browser.
 * "I will open", "shall I open?" and "open it yourself" are not claims.
 *
 * MEDIA, 2026-10-05: in the owner's bot chat a tools-less model answered
 * "made the poster with your photo" and sent nothing; on the next turn a
 * real model described a poster it never looked at. A finished picture,
 * video or sent file is a claim too, backed only by the tool that makes or
 * sends it. Same narrowness: "I will make", "shall I make?" are not claims.
 */

type ClaimKind = 'browser' | 'media'

const IMAGE_TOOLS = [
  'image_generate',
  'image_edit',
  'crm_deliver_photo',
  'agent_avatars_make',
  'crm_portrait_rescue',
]
const VIDEO_TOOLS = [
  'video_generate',
  'lipsync_generate',
  'reel_render',
  'split_reel',
  'story_reel',
  'crm_story_reel',
  'my_story_reel',
]
const SEND_TOOLS = [
  'tg_send',
  'tg_send_album',
  'tg_send_document',
  'tg_send_video',
  'tg_send_voice',
]

/* Claimed actions, each with the tool(s) that would have done it. */
const CLAIMS: Array<{ re: RegExp; tools: string[]; kind?: ClaimKind }> = [
  {
    re: /(^|[\s.,:;—-])(открываю|открыл|открылась|открылся)\s+(страниц|сайт|вкладк|linkedin|x\.com|google)/i, // cyrillic-ok: matched text
    tools: ['browser_open'],
  },
  {
    re: /(^|[\s.,:;—-])(делаю|сделал)\s+(снимок|скриншот)/i, // cyrillic-ok: matched text
    tools: ['browser_screenshot'],
  },
  {
    re: /(^|[\s.,:;—-])(читаю|прочитал)\s+(текст|страниц)/i, // cyrillic-ok: matched text
    tools: ['browser_read'],
  },
  {
    re: /(^|[\s.,:;—-])(нажимаю|нажал|жму)\s/i, // cyrillic-ok: matched text
    tools: ['browser_click'],
  },
  {
    re: /(^|[\s.,:;—-])(прокручиваю|прокрутил)\s/i, // cyrillic-ok: matched text
    tools: ['browser_evaluate', 'browser_click'],
  },
  {
    re: /(^|[\s.,:;—-])(проверяю|смотрю) (все )?вкладки/i, // cyrillic-ok: matched text
    tools: ['browser_status'],
  },
  {
    re: /(^|[\s.,:;—-])на экране (сейчас )?(вижу|видно|отображается)/i, // cyrillic-ok: matched text
    tools: ['browser_screenshot', 'browser_read'],
  },
  { re: /\b(I'm |I am |I )(opening|opened)\b/i, tools: ['browser_open'] },
  { re: /\b(I'm |I am |I )(clicking|clicked)\b/i, tools: ['browser_click'] },
  {
    re: /\b(I'm |I am |I )(taking|took) a screenshot\b/i,
    tools: ['browser_screenshot'],
  },
  {
    re: /(^|[\s.,:;—-])(?<!(?:^|[^а-яё])(?:не|ты|вы)\s+)(сделал|сделала|нарисовал|нарисовала|создал|создала|сгенерировал|сгенерировала|подготовил|подготовила)\s+((для )?(тебя|вас|тебе|вам)\s+)?(афиш|картинк|изображени|постер|обложк|баннер)/i, // cyrillic-ok: matched text
    tools: IMAGE_TOOLS,
    kind: 'media',
  },
  {
    re: /(^|[\s.,:;—-])вот\s+(тво[яй]|ваш[аи]?|готов[аяы]{1,2})\s+(афиш|картинк|постер|обложк|баннер)/i, // cyrillic-ok: matched text
    tools: IMAGE_TOOLS,
    kind: 'media',
  },
  {
    re: /(^|[\s.,:;—-])(?<!(?:^|[^а-яё])(?:не|ты|вы)\s+)(сделал|сделала|смонтировал|смонтировала|собрал|собрала)\s+((для )?(тебя|вас|тебе|вам)\s+)?(видео|ролик|рилс)/i, // cyrillic-ok: matched text
    tools: VIDEO_TOOLS,
    kind: 'media',
  },
  {
    re: /(^|[\s.,:;—-])(?<!(?:^|[^а-яё])(?:не|ты|вы)\s+)(отправил|отправила|прислал|прислала|скинул|скинула)\s+((тебе|вам)\s+)?(фото|картинк|афиш|постер|видео|ролик|файл)/i, // cyrillic-ok: matched text
    tools: [...SEND_TOOLS, ...IMAGE_TOOLS, ...VIDEO_TOOLS],
    kind: 'media',
  },
  {
    re: /\bI(?:'ve| have)? (made|created|generated|drew) (the |a |an |your )?(poster|image|picture|banner|cover|video)\b/i,
    tools: [...IMAGE_TOOLS, ...VIDEO_TOOLS],
    kind: 'media',
  },
  {
    re: /\bhere(?:'s| is) (the |your )(poster|image|picture|banner|cover)\b/i,
    tools: IMAGE_TOOLS,
    kind: 'media',
  },
]

/** Every tool that backs a media claim; the registry test reads it. */
export const MEDIA_TOOLS: readonly string[] = [
  ...IMAGE_TOOLS,
  ...VIDEO_TOOLS,
  ...SEND_TOOLS,
]

const kindOf = (c: { kind?: ClaimKind }): ClaimKind => c.kind ?? 'browser'

/*
 * Words inside quotes are someone else's: "Вы написали: «я сделал афишу»"
 * repeats the person, it claims nothing for us.
 *
 * A straight pair counts only on one line, opening after a line start, a
 * space or an opening mark, and closing before a non-letter (#3677): an inch
 * mark in 'Экран 27". Сделал афишу и отправил "файл".' used to swallow the
 * claim up to the next quote.
 */
const QUOTED = /«[^»\n]*»|(?<=^|[\s(\[:—-])"[^"\n]*"(?![\p{L}\d])|„[^“\n]*“/gmu

/*
 * "I sent you the poster above" points at an earlier turn, whose call is
 * not among this turn's events. A false note there is worse than none.
 * It excuses the media claims of ITS OWN sentence only (#3677): one
 * "ранее" elsewhere in the answer used to switch the check off for all.
 */
const REFERS_BACK = /(выше|ранее|в прошлом сообщении|\babove\b|\bearlier\b)/i // cyrillic-ok: matched text

function calledTools(events: Array<Record<string, unknown>>): string[] {
  return events
    .filter(
      e => e['тип'] === 'инструмент' && typeof e['имя'] === 'string' // cyrillic-ok: the event envelope's fields
    )
    .map(e => e['имя'] as string) // cyrillic-ok: the event envelope's field
}

/** Does the answer claim it acted in the browser? Pure. */
export function claimsBrowserWork(text: string): boolean {
  return CLAIMS.some(c => kindOf(c) === 'browser' && c.re.test(text))
}

/** How many browser tools the turn really called, from its events. Pure. */
export function browserCalls(events: Array<Record<string, unknown>>): number {
  return calledTools(events).filter(n => n.startsWith('browser_')).length
}

/** The claimed actions no call of their own tool backs. Pure. */
export function unbackedClaims(
  text: string,
  events: Array<Record<string, unknown>>
): string[] {
  return unbacked(text, events).map(c => c.tools[0])
}

/*
 * Where a sentence ends (#3677 review). A dot before a space is not enough:
 * "т.е.", "см.", "i.e." end nothing, so they lose their dots first, and a
 * sentence ends only before a capital, a quote, a bracket or a list marker.
 * A line break alone does not end one either ("Я сделал\nафишу" is one
 * claim); a blank line or a list marker does.
 */
const ABBREV = new RegExp(
  '(?<![\\p{L}])(?:т\\.е|т\\.д|т\\.п|см|п|напр|i\\.e|e\\.g|etc)\\.',
  'giu'
)
const LIST_ITEM = /^\s*(?:[-*•+]|\d+[.)]|\p{Extended_Pictographic}\uFE0F?)\s/u
const SENTENCE_END =
  /(?<=[.!?…])\s+(?=[\p{Lu}«"„(]|[-*•]\s|\d+[.)]\s|\p{Extended_Pictographic})/u

/*
 * A header that refers back covers the list right under it (#3680 round 4):
 * "Выше я:", "**Выше я:**", "### Что я сделал ранее", "Ранее я —",
 * "Выше я...". Markdown marks and the closing punctuation are style, not the
 * signal, so they are stripped first; what is left must be a short line that
 * refers back and does not end a sentence of its own.
 */
const HEADER_MAX = 60
function isHeader(line: string): boolean {
  const bare = line
    .replace(/^\s*#+\s*/, '')
    .replace(/[*_]+/g, '')
    .replace(/(?:\s|[:—–-]|…|\.{2,})+$/u, '')
    .trim()
  return (
    bare.length > 0 &&
    bare.length <= HEADER_MAX &&
    !/[.!?]$/.test(bare) &&
    REFERS_BACK.test(bare)
  )
}

/**
 * The answer's sentences, each with whether it refers back. A back-referring
 * header excuses the FIRST sentence of each list item under it, and nothing
 * past the list: an unindented line without a marker starts a new item,
 * a further sentence inside an item is judged on its own.
 */
function sentencesOf(raw: string): Array<{ text: string; back: boolean }> {
  const clean = raw
    .replace(QUOTED, ' ')
    .replace(ABBREV, m => m.replace(/\./g, ''))
  const out: Array<{ text: string; back: boolean }> = []
  for (const block of clean.split(/\n\s*\n/)) {
    const items: Array<{ text: string; listed: boolean }> = []
    for (const line of block.split('\n')) {
      const listed = LIST_ITEM.test(line)
      const last = items[items.length - 1]
      // a plain line continues plain text, or an item it is indented under
      const continues = last && !listed && (!last.listed || /^\s/.test(line))
      if (continues) last.text += ' ' + line
      else items.push({ text: line, listed })
    }
    let header = false
    items.forEach((item, i) => {
      if (!item.listed) header = false
      // the marker goes first: "1. Made it" must not split after "1."
      const body = item.listed ? item.text.replace(LIST_ITEM, '') : item.text
      body.split(SENTENCE_END).forEach((text, k) =>
        out.push({
          text,
          back: (item.listed && header && k === 0) || REFERS_BACK.test(text),
        })
      )
      if (!item.listed && items[i + 1]?.listed && isHeader(item.text))
        header = true
    })
  }
  return out
}

function unbacked(raw: string, events: Array<Record<string, unknown>>) {
  const sentences = sentencesOf(raw)
  const called = new Set(calledTools(events))
  return CLAIMS.filter(c =>
    sentences.some(s => c.re.test(s.text) && !(kindOf(c) === 'media' && s.back))
  ).filter(c => !c.tools.some(t => called.has(t)))
}

/** Which kinds of claim no call backs, browser first. Pure. */
export function unbackedKinds(
  text: string,
  events: Array<Record<string, unknown>>
): ClaimKind[] {
  const kinds = new Set(unbacked(text, events).map(kindOf))
  return (['browser', 'media'] as ClaimKind[]).filter(k => kinds.has(k))
}

/**
 * What the server log says about a flagged turn. Loop turn 6 (27.09.2026):
 * the log line carried `toolCalls: 0` written as a constant, and a turn with
 * seven calls (browser_ask_permission among them) was logged as having none
 * -- a flag nobody could tell from a false positive. The log now names the
 * claimed actions no call backed, and the browser calls the turn really made.
 * No words of the answer: they are the person's conversation. Pure.
 */
export function honestyLogFields(
  text: string,
  events: Array<Record<string, unknown>>
): {
  claim: string
  unbacked: string[]
  browserCalls: number
  toolCalls: number
} {
  return {
    claim: unbackedKinds(text, events).join('+'),
    unbacked: unbackedClaims(text, events),
    browserCalls: browserCalls(events),
    toolCalls: calledTools(events).length,
  }
}

export const HONESTY_NOTE =
  '\n\n⚠️ Проверка: в этом ответе агент описал действия в браузере, но не ' + // cyrillic-ok: shown to the person
  'выполнил их — часть описанного не происходила. Попросите его ' + // cyrillic-ok
  'повторить, и он сделает это по-настоящему.' // cyrillic-ok

export const MEDIA_HONESTY_NOTE =
  '\n\n⚠️ Проверка: в этом ответе агент написал, что сделал или отправил ' + // cyrillic-ok: shown to the person
  'картинку или видео, но не вызвал инструмент, который это делает, — ' + // cyrillic-ok
  'файла нет. Попросите повторить, и он сделает это по-настоящему.' // cyrillic-ok

const NOTES: Record<ClaimKind, string> = {
  browser: HONESTY_NOTE,
  media: MEDIA_HONESTY_NOTE,
}

/** The note to append, or '' when every claimed action really ran. Pure. */
export function honestyNote(
  text: string,
  events: Array<Record<string, unknown>>
): string {
  return unbackedKinds(text, events)
    .map(k => NOTES[k])
    .join('')
}
