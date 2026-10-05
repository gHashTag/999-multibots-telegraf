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
 *
 * VOICE, 2026-10-06 (#3684): "recorded you a voice note" with no audio call
 * is the same false claim with sound. Only a first-person recorded, sent or
 * voiced message counts: "voice mode", "answer by voice?" and "in your voice
 * note you said" name the person's voice, not ours.
 */

type ClaimKind = 'browser' | 'media' | 'voice'

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
const AUDIO_TOOLS = ['audio_generate', 'voice_clone_speak', 'tg_send_voice']

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
  {
    re: /(^|[\s.,:;—-])(?<!(?:^|[^а-яё])(?:не|ты|вы)\s+)(записал|записала|отправил|отправила|прислал|прислала|скинул|скинула|озвучил|озвучила)\s+((для )?(тебя|вас|тебе|вам)\s+)?(голосов|аудио|войс)/i, // cyrillic-ok: matched text
    tools: AUDIO_TOOLS,
    kind: 'voice',
  },
  {
    re: /(^|[\s.,:;—-])(?<!(?:^|[^а-яё])(?:не|ты|вы)\s+)(озвучил|озвучила)\s+((для )?(тебя|вас|тебе|вам)\s+)?(текст|пост|сценари|ответ|сообщени|письм)/i, // cyrillic-ok: matched text
    tools: AUDIO_TOOLS,
    kind: 'voice',
  },
  {
    re: /(^|[\s.,:;—-])(вот\s+(тво[её]|ваше)\s+голосовое|голосовое\s+(сообщение\s+)?готово)/i, // cyrillic-ok: matched text
    tools: AUDIO_TOOLS,
    kind: 'voice',
  },
  {
    re: /\bI(?:'ve| have)? (recorded|sent)( you)? (a |an |the |your )?(voice|audio) ?(note|message|reply|clip)?\b/i,
    tools: AUDIO_TOOLS,
    kind: 'voice',
  },
  {
    re: /\bI(?:'ve| have)? voiced (it|this|the|your)\b|\b(?:your |the )?voice (?:note|message) is ready\b/i,
    tools: AUDIO_TOOLS,
    kind: 'voice',
  },
  {
    re: /\bhere(?:'s| is) (the |your )(audio|voice (?:note|message|reply))\b|\b(?:voice|audio) (?:note|message|reply) (?:is |has been )?sent\b/i,
    tools: AUDIO_TOOLS,
    kind: 'voice',
  },
]

/** Every tool that backs a media claim; the registry test reads it. */
export const MEDIA_TOOLS: readonly string[] = [
  ...IMAGE_TOOLS,
  ...VIDEO_TOOLS,
  ...SEND_TOOLS,
]

/** Every tool that backs a voice claim; the registry test reads it too. */
export const VOICE_TOOLS: readonly string[] = AUDIO_TOOLS

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
 * It excuses the media and voice claims of ITS OWN sentence only (#3677): one
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
/*
 * A plan's list is not a report either (#3693 review): "Steps:\n1. Recorded
 * a voice note" lists what will be done. Closed list of plan headers.
 */
const PLAN_HEADER =
  /^(?:шаги|план|по шагам|что (?:я )?сделаю|что нужно сделать|steps|plan|to ?do)$/i // cyrillic-ok: matched text
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
    (REFERS_BACK.test(bare) || PLAN_HEADER.test(bare))
  )
}

/**
 * The answer's sentences, each with whether it refers back. A back-referring
 * header excuses the FIRST sentence of each list item under it, and nothing
 * past the list: an unindented line without a marker starts a new item,
 * a further sentence inside an item is judged on its own.
 *
 * A blank line ends an item, but not a header's reach: models put a blank
 * line after a heading, so a header still covers the
 * list that opens the next one (#3680 round 5). An emoji-led line that is
 * itself a referring header ("<pin emoji> Above I:") is a header, not an item.
 *
 * A header right under a list item reaches too (#3689): "- Done\nAbove I:\n\n
 * - made the poster" heads the second list. The old "alone in its
 * paragraph" rule only ever failed for that case, since a plain line after
 * a plain line joins it.
 */
function sentencesOf(raw: string): Array<{ text: string; back: boolean }> {
  const clean = raw
    .replace(QUOTED, ' ')
    .replace(ABBREV, m => m.replace(/\./g, ''))
  const out: Array<{ text: string; back: boolean }> = []
  const items: Array<{ text: string; listed: boolean }> = []
  for (const block of clean.split(/\n\s*\n/)) {
    const first = items.length
    for (const line of block.split('\n')) {
      const listed = LIST_ITEM.test(line)
      const last = items.length > first ? items[items.length - 1] : undefined
      // a plain line continues plain text, or an item it is indented under
      const continues = last && !listed && (!last.listed || /^\s/.test(line))
      if (continues) last.text += ' ' + line
      else items.push({ text: line, listed })
    }
  }
  // a header reaches the list right under it, or across one blank line
  const headsList = (i: number) =>
    items[i + 1]?.listed === true && isHeader(items[i].text)
  const EMOJI_LED = /^\s*\p{Extended_Pictographic}/u
  // an emoji-led referring header followed by a list heads it
  items.forEach((item, i) => {
    if (item.listed && EMOJI_LED.test(item.text) && headsList(i))
      item.listed = false
  })
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
    if (!item.listed && headsList(i)) header = true
  })
  return out
}

/*
 * Whose verb is it (#3693 review)? "Anna recorded a voice note" and "the
 * client sent a photo" describe someone else; in the CRM the agent says that all
 * day. A list of what may stand before the agent's own verb never ends
 * ("Короче", "Наконец", "По твоей просьбе" ...), so the check is inverted
 * (#3693 round 2): the verb is someone else's only when a non-agent subject
 * stands right before it in its clause -- a word of OTHER_SUBJECT, or a
 * capitalised word that is not the agent's own name. Anything else is the
 * agent's, and the claim is checked.
 */
const OTHER_SUBJECT = new Set([
  'клиент',
  'клиентка',
  'клиенты', // cyrillic-ok: matched words
  'заказчик',
  'заказчица',
  'покупатель',
  'покупательница', // cyrillic-ok: matched words
  'пользователь',
  'он',
  'она',
  'они', // cyrillic-ok: matched words
  'кто-то',
  'кто-нибудь', // cyrillic-ok: matched words
])
// the agent naming itself is not someone else
const AGENT_SELF = new Set(['я', 'мы', 'тринити']) // cyrillic-ok: matched words
/*
 * A capital before the verb is ambiguous: "Анна записала" names someone,
 * "Короче сделала" opens the agent's sentence. Only for a capitalised word
 * is a closed list of sentence adverbs read as the agent's; any other
 * capitalised word is a name. A lowercase word is never a name.
 */
const LEAD_ADVERB = new Set([
  'короче',
  'ну',
  'теперь',
  'наконец',
  'наконец-то', // cyrillic-ok: matched words
  'быстро',
  'снова',
  'заново',
  'опять',
  'сразу',
  'уже', // cyrillic-ok: matched words
  'вот',
  'итак',
  'готово',
  'отлично',
  'хорошо',
  'супер', // cyrillic-ok: matched words
  'сейчас',
  'сегодня',
  'вчера',
  'только',
  'тоже',
  'также',
  'ещё',
  'еще', // cyrillic-ok: matched words
  'всё',
  'так',
  'да',
  'ок',
  'окей',
  'ok',
  'конечно',
  'кстати',
  'просто', // cyrillic-ok: matched words
  'сначала',
  'потом',
  'затем',
  'тут',
  'здесь',
  'ладно',
  'сама',
  'сам',
  'специально', // cyrillic-ok: matched words
])
// a clause starts after a comma, a colon, a dash, a bracket or "and"
const CLAUSE_BREAK = /[,;:—–()]|\s-\s|(?<!\p{L})и(?!\p{L})/gu // cyrillic-ok: matched words

function ownVerb(sentence: string, m: RegExpMatchArray): boolean {
  const verbAt = (m.index ?? 0) + (m[1] ?? '').length
  const clause = sentence.slice(0, verbAt).split(CLAUSE_BREAK).pop() ?? ''
  const words = clause.match(/\p{L}+(?:-\p{L}+)*/gu) ?? []
  const before = words.at(-1)
  if (!before) return true
  const low = before.toLowerCase()
  if (AGENT_SELF.has(low)) return true
  if (OTHER_SUBJECT.has(low)) return false
  if (before[0] === low[0]) return true
  return LEAD_ADVERB.has(low)
}

/*
 * "Did I send the audio file?" asks: the claim's OWN clause ends in a
 * question mark (#3693 round 2). A dash, a bracket, a newline or an emoji
 * ends the clause first, so "Сделала афишу — как тебе?" still claims. A
 * verb-led claim asks only when the "?" closes the matched word itself
 * ("Записал голосовое?"), so "Сделала афишу нравится?" claims too.
 */
const CLAUSE_END = /\n|[^\p{L}\p{N} \t'’"«»-]|(?<!\p{L})-|-(?!\p{L})/u

function asked(sentence: string, m: RegExpMatchArray, verbLed: boolean) {
  const rest = sentence.slice((m.index ?? 0) + m[0].length)
  const end = rest.search(CLAUSE_END)
  if (end < 0 || rest[end] !== '?') return false
  return !verbLed || /^\p{L}*$/u.test(rest.slice(0, end))
}

/* A verb-led Russian claim: its group 1 is the boundary before the verb. */
const VERB_LED = (c: { re: RegExp }) => c.re.source.includes('(?<!')

// every match counts: "Anna sent a photo, and I sent the poster" claims (round 2)
function claimedIn(
  c: (typeof CLAIMS)[number],
  s: { text: string; back: boolean }
) {
  if (kindOf(c) === 'browser') return c.re.test(s.text)
  if (s.back) return false
  const verbLed = VERB_LED(c)
  const all = new RegExp(c.re.source, c.re.flags.replace('g', '') + 'g')
  for (const m of s.text.matchAll(all)) {
    if (asked(s.text, m, verbLed)) continue
    if (!verbLed || ownVerb(s.text, m)) return true
  }
  return false
}

function unbacked(raw: string, events: Array<Record<string, unknown>>) {
  const sentences = sentencesOf(raw)
  const called = new Set(calledTools(events))
  return CLAIMS.filter(c => sentences.some(s => claimedIn(c, s))).filter(
    c => !c.tools.some(t => called.has(t))
  )
}

/** Which kinds of claim no call backs, browser first. Pure. */
export function unbackedKinds(
  text: string,
  events: Array<Record<string, unknown>>
): ClaimKind[] {
  const kinds = new Set(unbacked(text, events).map(kindOf))
  return (['browser', 'media', 'voice'] as ClaimKind[]).filter(k =>
    kinds.has(k)
  )
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

export const VOICE_HONESTY_NOTE =
  '\n\n⚠️ Проверка: в этом ответе агент написал, что записал или отправил ' + // cyrillic-ok: shown to the person
  'голосовое, но не вызвал инструмент, который это делает, — записи нет. ' + // cyrillic-ok
  'Попросите повторить, и он сделает это по-настоящему.' // cyrillic-ok

const NOTES: Record<ClaimKind, string> = {
  browser: HONESTY_NOTE,
  media: MEDIA_HONESTY_NOTE,
  voice: VOICE_HONESTY_NOTE,
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
