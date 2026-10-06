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

/*
 * The gap between a claim verb and its object (#3734). The patterns wanted
 * the object right after the verb, so an indirect object or an adverb in
 * between -- "Сделала Анне афишу", "Отправила вам только что голосовое", // cyrillic-ok: quoted input
 * "I made you the poster" -- left the claim silent, the unsafe side. A count
 * of words would be one more fixed window, so the regex lets any run of
 * words through and gapHolds() bounds it: no clause break, only gap-shaped
 * words (round 2: an addressee, a name, an adverb, a number), no preposition
 * governing the object, and, for a Russian verb, no other subject in it.
 */
const GAP = String.raw`(?<gap>(?:[\p{L}\p{N}][\p{L}\p{N}\p{M}'’-]*\s+)*?)`
const claim = (source: string) => new RegExp(source, 'diu')

/*
 * Plural objects (#3744). The English nouns ended in \b, so "I generated
 * two images" stopped at "image" + "s" and the claim stayed silent, the
 * unsafe side. Every English object noun takes its plural through EN_NOUN
 * and ends at EN_END: not a letter and not an apostrophe, so "two
 * posters' worth of notes" and "the poster's text" name something else
 * and stay silent. Russian objects match by stem, so their plurals already
 * held; only the "вот ..." openers listed singular forms. // cyrillic-ok: quoted input
 */
const WORD_END = String.raw`(?![\p{L}'’])`
const EN_END = WORD_END
/*
 * A modifier, not the object (#3753). "Here is the poster idea:", "I sent
 * you the voice notes transcript", "Here is the audio plan" name an idea, a
 * transcript, a plan: the media noun modifies the head noun after it, and no
 * file is claimed. The regex still matches the media noun; modifierOnly()
 * below reads what follows it and silences the claim only when the head
 * noun plainly ends the object. Every rule is closed on the SAFE side, since
 * a missed claim is the worse failure (round 1 lost 20 claims main caught).
 *
 * The list holds only heads that name words or an abstract property, never
 * a rendered file: an idea, a text, a prompt, a plan, a size, a style, a
 * transcript, a letter ("cover letter"). Left out on purpose, so they still
 * flag: "draft", "layout", "mockup", "preview", "version", "photo" -- a
 * poster draft or a cover mockup IS a picture. "copy" is singular only: "the
 * poster copy" is its text, "fifty poster copies" are prints. "of" is not a
 * head either: "I made a cover of the song" claims a cover (a song cover is
 * audio no call made), and "a poster of your photo" is a poster.
 */
const HEAD_NOUNS = [
  'idea',
  'text',
  'prompt',
  'concept',
  'plan',
  'option',
  'size',
  'transcript',
  'preference',
  'template',
  'description',
  'caption',
  'brief',
  'script',
  'requirement',
  'tip',
  'format',
  'style',
  'list',
  'outline',
  'spec',
  'setting',
  'letter',
]
const HEAD_WORDS = String.raw`${HEAD_NOUNS.map(n => `${n}s?`).join('|')}`
const HEAD = String.raw`(?:${HEAD_WORDS}|copy)`
// after a make verb "copy" is a copy of the picture, not its text (round 3)
const MAKE_HEAD = String.raw`(?:${HEAD_WORDS})`
/*
 * Number agreement (#3748 round 2). After "here are" a singular noun can
 * only be a modifier -- "Here are the poster ideas:", "Here are the image
 * sizes Instagram accepts" -- so an opener that fixes the number takes only
 * the forms that agree with it: 'one' the singular, 'many' the plural.
 * Both come from the same noun list, so no list is written twice.
 */
type EnNumber = 'one' | 'many' | 'any'
const enForm = (noun: string, num: EnNumber) => {
  const stem = noun.endsWith('y') ? noun.slice(0, -1) : noun
  const [one, many] = noun.endsWith('y') ? ['y', 'ies'] : ['', 's']
  if (num === 'one') return noun
  if (num === 'many') return stem + many
  return `${stem}(?:${one}|${many})`
}
const EN_NOUN = (nouns: readonly string[], num: EnNumber = 'any') =>
  `(${nouns.map(n => enForm(n, num)).join('|')})${EN_END}`
const PICTURE_NOUNS = ['poster', 'image', 'picture', 'banner', 'cover']
const VOICE_NOUNS = ['note', 'message', 'reply', 'clip']
const EN_MEDIA = EN_NOUN([...PICTURE_NOUNS, 'video'])
const EN_VOICE = EN_NOUN(VOICE_NOUNS)
// "voice" alone is the object only when no voice noun follows: "the voice
// notes transcript" must not fall back to a bare "voice" (#3753)
const NOT_VOICE_NOUN = String.raw`(?!\s+(?:${VOICE_NOUNS.map(n => enForm(n, 'any')).join('|')})${WORD_END})`

/*
 * The Russian side of #3753: "голосовое" is an adjective standing for a // cyrillic-ok: quoted input
 * voice message, so before one of these nouns it names the noun instead: // cyrillic-ok: quoted input
 * "Вот твоё голосовое мнение" is an opinion, "голосовые настройки" settings. // cyrillic-ok: quoted input
 * Closed on the same safe side: "голосовое сообщение", "голосовая заметка", // cyrillic-ok: quoted input
 * "голосовое письмо" are audio, and any noun not listed keeps the claim. // cyrillic-ok: quoted input
 * Left out on purpose: "описание", "задание", "пожелания", "команды" -- a // cyrillic-ok: quoted input
 * recorded voice description or wish IS audio. // cyrillic-ok: quoted input
 */
const RU_HEAD = '(?:мнени|управлени|меню|настройк|функци|предпочтени|режим)' // cyrillic-ok: matched stems

/*
 * When the head noun really ends the object (#3753 round 2). Round 1 read
 * any head noun as the end, and lost 20 claims main caught: "I created the
 * image prompt and the image", "I made the poster text bigger", "Here is
 * the poster text-free version", "Here is the banner text overlay". The
 * media noun is a modifier only when ALL of these hold:
 * (a) a head noun (or a run of them: "the audio settings list") follows it
 *     after a space, and the clause ends right there -- the end of the
 *     sentence, a stop, a colon, a semicolon, a line break, a comma or a
 *     dash with a space -- or, after a presentational opener ("here is",
 *     "sent you"), a closed tail starts: a preposition ("for the launch") or
 *     a relative clause with its own subject ("I would use", "Telegram
 *     accepts");
 * (b) nothing is glued by an unspaced hyphen: "poster-text", "text-free";
 * (c) the WHOLE REST OF THE MESSAGE after the head noun, not only its
 *     sentence (#3753 round 3), names (i) no other picture or voice noun:
 *     "the image prompt, and the image", "the poster idea. The poster is
 *     attached." still claim; (ii) no delivery word from DELIVERY_WORDS:
 *     "the poster idea, attached", "the poster text, rendered and
 *     attached"; (iii) no "it", "them" or their Russian forms, which can
 *     carry the media as an object: "the poster text, and I attached it",
 *     "the poster text. It is attached." A comma, semicolon or dash ends
 *     the clause for (a) only; (c) reads past every clause end;
 * (d) after "made/created/generated/drew" no tail but a preposition: "made
 *     the poster text bigger" and "made the poster style you asked for"
 *     report an edit of a rendered picture; and "copy" is no head there:
 *     "I made the poster copy" is a copy of the poster, a picture (round 3).
 * Russian takes (a) without any tail, (b) and (c): "Записал голосовое меню // cyrillic-ok: quoted input
 * для тебя" stays flagged, the arguable side being the safe one. // cyrillic-ok: quoted input
 */
const CLAUSE_ENDS = String.raw`(?=\s*$|\s*\n|[.!?…;:)](?![\p{L}\p{N}])|,(?:\s|$)|\s[-—–]\s|\s?[—–])`
const headRun = (head: string) =>
  String.raw`(?:\s+${head}${WORD_END}(?!-))(?:\s+(?:${head}|draft)${WORD_END}(?!-))*`
const HEAD_RUN = headRun(HEAD)
const MAKE_HEAD_RUN = headRun(MAKE_HEAD)
const PREP_TAIL = String.raw`\s+(?:for|in|from|on)\s`
const SUBJECT_TAIL = String.raw`\s+(?:I|I'd|I'll|I've|you|we|they|that|which|\p{Lu}\p{Ll}+)\s`
const EN_HEAD_MAKE = new RegExp(
  String.raw`^${MAKE_HEAD_RUN}(?:${CLAUSE_ENDS}|(?=${PREP_TAIL}))`,
  'iu'
)
// the tail words are cased: "I" and a proper noun are capitals
const EN_HEAD_SHOWN = new RegExp(
  String.raw`^${HEAD_RUN}(?:${CLAUSE_ENDS}|(?=${PREP_TAIL})|(?=${SUBJECT_TAIL}))`,
  'u'
)
const RU_HEAD_AFTER = new RegExp(
  String.raw`^[а-яё]*\s+${RU_HEAD}[а-яё]*(?![\p{L}-])${CLAUSE_ENDS}`, // cyrillic-ok: matched letters
  'iu'
)
const MEDIA_WORDS = [...PICTURE_NOUNS, 'video', ...VOICE_NOUNS]
  .map(n => enForm(n, 'any'))
  .concat(['voice', 'audio'])
  .join('|')
// the match ends on its object noun: only then can a head noun follow it
const EN_OBJECT_LAST = new RegExp(String.raw`(?:${MEDIA_WORDS})$`, 'iu')
const RU_OBJECT_LAST = /(?:голосов|голосовое|голосовые|аудио|войс)$/i // cyrillic-ok: matched stems
const EN_MEDIA_LATER = new RegExp(
  String.raw`(?<![\p{L}'’-])(?:${MEDIA_WORDS})(?![\p{L}'’])`,
  'iu'
)
const RU_MEDIA_LATER =
  /(?<![а-яё])(?:голосов|аудио|войс|афиш|картинк|изображени|постер|обложк|баннер|видео|ролик|рилс|фото)/i // cyrillic-ok: matched stems
const MAKE_VERB = /\b(?:made|make|created|generated|drew|drawn)\b/i

/*
 * (c)(ii) of round 3: one closed list of words that deliver a file. Any of
 * them anywhere after the head noun keeps the claim, even when it speaks of
 * something else ("the plan is ready"): a needless note is the cheaper
 * failure. "above" is listed although REFERS_BACK excuses its own sentence:
 * here it is read from a later one.
 */
const DELIVERY_WORDS = [
  'attached',
  'attach',
  'attaching',
  'sent',
  'send',
  'rendered',
  'render',
  'generated',
  'generate',
  'made',
  'created',
  'drew',
  'uploaded',
  'below',
  'above',
  'here it is',
  'the file',
  'ready',
  'done',
]
const RU_DELIVERY_STEMS = [
  'прикрепил', // cyrillic-ok: matched stem
  'отправил', // cyrillic-ok: matched stem
  'сгенерировал', // cyrillic-ok: matched stem
  'сделал', // cyrillic-ok: matched stem
  'нарисовал', // cyrillic-ok: matched stem
  'готов', // cyrillic-ok: matched stem
  'ниже', // cyrillic-ok: matched stem
  'файл', // cyrillic-ok: matched stem
]
// (c)(iii): a pronoun that can carry the media as an object
const OBJECT_PRONOUNS = ['it', 'them', 'это', 'его', 'её', 'ее'] // cyrillic-ok: matched words
const EN_DELIVERY_LATER = new RegExp(
  String.raw`(?<![\p{L}'’-])(?:${DELIVERY_WORDS.map(w => w.replace(/ /g, '\\s+')).join('|')})(?![\p{L}'’])`,
  'iu'
)
const RU_DELIVERY_LATER = new RegExp(
  String.raw`(?<!\p{L})(?:${RU_DELIVERY_STEMS.join('|')})`,
  'iu'
)
const PRONOUN_LATER = new RegExp(
  String.raw`(?<![\p{L}'’-])(?:${OBJECT_PRONOUNS.join('|')})(?![\p{L}'’])`,
  'iu'
)

function modifierOnly(s: Sentence, m: RegExpMatchArray) {
  const end = (m.index ?? 0) + m[0].length
  const after = s.text.slice(end)
  let head: RegExpMatchArray | null = null
  if (RU_OBJECT_LAST.test(m[0])) head = after.match(RU_HEAD_AFTER)
  else if (EN_OBJECT_LAST.test(m[0]))
    head = after.match(MAKE_VERB.test(m[0]) ? EN_HEAD_MAKE : EN_HEAD_SHOWN)
  if (!head) return false
  // the rest of the whole message, not of the sentence (round 3)
  const rest = s.flat.slice(end + head[0].length) + ' ' + s.later
  return ![
    EN_MEDIA_LATER,
    RU_MEDIA_LATER,
    EN_DELIVERY_LATER,
    RU_DELIVERY_LATER,
    PRONOUN_LATER,
  ].some(re => re.test(rest))
}

/* Claimed actions, each with the tool(s) that would have done it. */
const CLAIMS: Array<{ re: RegExp; tools: string[]; kind?: ClaimKind }> = [
  {
    re: claim(
      String.raw`(^|[\s.,:;—-])(открываю|открыл|открылась|открылся)\s+${GAP}(страниц|сайт|вкладк|linkedin|x\.com|google)`
    ), // cyrillic-ok: matched text
    tools: ['browser_open'],
  },
  {
    re: claim(
      String.raw`(^|[\s.,:;—-])(делаю|сделал)\s+${GAP}(снимок|скриншот)`
    ), // cyrillic-ok: matched text
    tools: ['browser_screenshot'],
  },
  {
    re: claim(
      String.raw`(^|[\s.,:;—-])(читаю|прочитал)\s+${GAP}(текст|страниц)`
    ), // cyrillic-ok: matched text
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
    re: claim(String.raw`(^|[\s.,:;—-])(проверяю|смотрю) ${GAP}(все )?вкладки`), // cyrillic-ok: matched text
    tools: ['browser_status'],
  },
  {
    re: /(^|[\s.,:;—-])на экране (сейчас )?(вижу|видно|отображается)/i, // cyrillic-ok: matched text
    tools: ['browser_screenshot', 'browser_read'],
  },
  { re: /\b(I'm |I am |I )(opening|opened)\b/i, tools: ['browser_open'] },
  { re: /\b(I'm |I am |I )(clicking|clicked)\b/i, tools: ['browser_click'] },
  {
    re: claim(String.raw`\b(I'm |I am |I )(taking|took) ${GAP}a screenshot\b`),
    tools: ['browser_screenshot'],
  },
  {
    re: claim(
      String.raw`(^|[\s.,:;—-])(?<!(?:^|[^а-яё])(?:не|ты|вы)\s+)(сделал|сделала|нарисовал|нарисовала|создал|создала|сгенерировал|сгенерировала|подготовил|подготовила)\s+((для )?(тебя|вас|тебе|вам)\s+)?${GAP}(афиш|картинк|изображени|постер|обложк|баннер)`
    ), // cyrillic-ok: matched text
    tools: IMAGE_TOOLS,
    kind: 'media',
  },
  {
    // a stem followed by the adjective suffix is a modifier, not the object:
    // "вот твои постерные идеи" names ideas (#3748 round 2) // cyrillic-ok: quoted input
    re: /(^|[\s.,:;—-])вот\s+(тво[яйи]|ваш[аи]?|готов(?:ая|ый|ые|а|ы))\s+(афиш|картинк|постер|обложк|баннер)(?!н)/i, // cyrillic-ok: matched text
    tools: IMAGE_TOOLS,
    kind: 'media',
  },
  {
    re: claim(
      String.raw`(^|[\s.,:;—-])(?<!(?:^|[^а-яё])(?:не|ты|вы)\s+)(сделал|сделала|смонтировал|смонтировала|собрал|собрала)\s+((для )?(тебя|вас|тебе|вам)\s+)?${GAP}(видео|ролик|рилс)`
    ), // cyrillic-ok: matched text
    tools: VIDEO_TOOLS,
    kind: 'media',
  },
  {
    re: claim(
      String.raw`(^|[\s.,:;—-])(?<!(?:^|[^а-яё])(?:не|ты|вы)\s+)(отправил|отправила|прислал|прислала|скинул|скинула)\s+((тебе|вам)\s+)?${GAP}(фото|картинк|афиш|постер|видео|ролик|файл)`
    ), // cyrillic-ok: matched text
    tools: [...SEND_TOOLS, ...IMAGE_TOOLS, ...VIDEO_TOOLS],
    kind: 'media',
  },
  {
    re: claim(
      String.raw`\bI(?:'ve| have)? (made|created|generated|drew|drawn) ${GAP}(the |a |an |your )?` +
        EN_MEDIA
    ),
    tools: [...IMAGE_TOOLS, ...VIDEO_TOOLS],
    kind: 'media',
  },
  {
    re: claim(
      String.raw`\bhere(?:'s| is) (the |your )${EN_NOUN(PICTURE_NOUNS, 'one')}` +
        String.raw`|\bhere are (the |your )${EN_NOUN(PICTURE_NOUNS, 'many')}`
    ),
    tools: IMAGE_TOOLS,
    kind: 'media',
  },
  {
    re: claim(
      String.raw`(^|[\s.,:;—-])(?<!(?:^|[^а-яё])(?:не|ты|вы)\s+)(записал|записала|отправил|отправила|прислал|прислала|скинул|скинула|озвучил|озвучила)\s+((для )?(тебя|вас|тебе|вам)\s+)?${GAP}(голосов|аудио|войс)`
    ), // cyrillic-ok: matched text
    tools: AUDIO_TOOLS,
    kind: 'voice',
  },
  {
    re: claim(
      String.raw`(^|[\s.,:;—-])(?<!(?:^|[^а-яё])(?:не|ты|вы)\s+)(озвучил|озвучила)\s+((для )?(тебя|вас|тебе|вам)\s+)?${GAP}(текст|пост|сценари|ответ|сообщени|письм)`
    ), // cyrillic-ok: matched text
    tools: AUDIO_TOOLS,
    kind: 'voice',
  },
  {
    re: new RegExp(
      String.raw`(^|[\s.,:;—-])(вот\s+(тво[её]|ваше|твои|ваши)\s+голосов(?:ое|ые)|голосовое\s+(сообщение\s+)?готово|голосовые\s+(сообщения\s+)?готовы)`, // cyrillic-ok: matched text
      'i'
    ),
    tools: AUDIO_TOOLS,
    kind: 'voice',
  },
  {
    re: claim(
      String.raw`\bI(?:'ve| have)? (recorded|sent)( you)? ${GAP}(a |an |the |your )?(voice|audio)(?: ${EN_VOICE}|${EN_END}${NOT_VOICE_NOUN})`
    ),
    tools: AUDIO_TOOLS,
    kind: 'voice',
  },
  {
    re: /\bI(?:'ve| have)? voiced (it|this|these|them|the|your)\b|\b(?:your |the )?voice (?:note is|message is|notes are|messages are) ready\b/i,
    tools: AUDIO_TOOLS,
    kind: 'voice',
  },
  {
    re: claim(
      String.raw`\bhere(?:'s| is) (the |your )(audio${EN_END}|voice ${EN_NOUN(VOICE_NOUNS, 'one')})` +
        String.raw`|\bhere are (the |your )voice ${EN_NOUN(VOICE_NOUNS, 'many')}` +
        String.raw`|\b(?:voice|audio) (?:(?:note|message|reply) (?:is |has been )?|(?:notes|messages|replies) (?:are |have been )?)sent\b`
    ),
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
 * Whitespace has ONE definition, applied ONCE at the entry (#3728 round 6).
 * Rounds 3-5 folded exotic whitespace site by site, and each round found a
 * site still reading the raw text: REFERS_BACK and the plan headers spell a
 * plain space, so "в\u00a0прошлом сообщении" gained a needless note. Now
 * every exported function that takes answer text normalises it first, and
 * nothing inside this module ever sees anything but "\n" and " ":
 * - every line break -- "\r\n", "\r", "\n", "\v", "\f", U+0085 (NEL, which
 *   "\s" does not cover), U+2028, U+2029 -- becomes "\n";
 * - every other whitespace character ("\s" minus the breaks: a tab, the
 *   U+00A0 Russian typography puts after a short word, a thin or an
 *   ideographic space) becomes " ".
 * A line break still ends a clause (round 3); an inline space never does.
 */
const LINE_BREAKS = '\\n\\r\\v\\f\\u0085\\u2028\\u2029'
const LINE_BREAK = new RegExp(`\\r\\n|[${LINE_BREAKS}]`, 'g')
const INLINE_SPACE = new RegExp(`[^\\S${LINE_BREAKS}]`, 'g')

/** The one form this module reads; every exported text entry calls it. */
function normalised(text: string): string {
  return text.replace(LINE_BREAK, '\n').replace(INLINE_SPACE, ' ')
}

/*
 * The form every claim pattern reads (#3728 round 4). Patterns spell a space
 * literally ("на экране вижу", "I clicked"), and a model wraps lines
 * anywhere, so the line breaks of the normalised text become spaces too. It
 * keeps the length, so a match index in it is the same index in the
 * normalised text, where the clause rules read the breaks.
 */
const flatOf = (text: string): string => text.replace(/\n/g, ' ')

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
  const norm = normalised(text)
  const flat = flatOf(norm)
  return CLAIMS.some(
    c =>
      kindOf(c) === 'browser' &&
      [...flat.matchAll(everyMatch(c))].some(m => gapHolds(norm, m, false))
  )
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
  return toolsOf(unbacked(normalised(text), events))
}

const toolsOf = (claims: typeof CLAIMS) => claims.map(c => c.tools[0])

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
// later: the flat text of every sentence after this one, read by modifierOnly
type Sentence = { text: string; flat: string; back: boolean; later: string }

// reads normalised text only: see normalised()
function sentencesOf(norm: string): Sentence[] {
  const clean = norm
    .replace(QUOTED, ' ')
    .replace(ABBREV, m => m.replace(/\./g, ''))
  const out: Sentence[] = []
  const items: Array<{ text: string; listed: boolean }> = []
  for (const block of clean.split(/\n\s*\n/)) {
    const first = items.length
    for (const line of block.split('\n')) {
      const listed = LIST_ITEM.test(line)
      const last = items.length > first ? items[items.length - 1] : undefined
      // a plain line continues plain text, or an item it is indented under
      const continues = last && !listed && (!last.listed || /^\s/.test(line))
      if (continues) last.text += '\n' + line.trimStart()
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
        flat: flatOf(text),
        back: (item.listed && header && k === 0) || REFERS_BACK.test(text),
        later: '',
      })
    )
    if (!item.listed && headsList(i)) header = true
  })
  out.forEach((o, i) => {
    o.later = out
      .slice(i + 1)
      .map(x => x.flat)
      .join(' ')
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
 * capitalised word that is not the agent's own name and is not governed by a
 * preposition (round 4). Anything else is the agent's, and the claim is
 * checked.
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
  // roles a CRM line names as the subject (#3723: no capital makes them a name)
  'менеджер',
  'администратор',
  'админ',
  'мастер',
  'курьер',
  'партнёр',
  'партнер',
  'коллега',
  'подруга',
  'друг',
  'муж',
  'жена',
  'мама',
  'папа',
  'владелец',
  'владелица',
  'дизайнер',
  'фотограф',
  'client',
  'customer',
  'manager',
  'кто-то',
  'кто-нибудь', // cyrillic-ok: matched words
])
// the agent naming itself, or the person it talks to, is not someone else
const AGENT_SELF = new Set([
  'я',
  'мы',
  'тринити',
  'trinity',
  'агент',
  'бот',
  'нейросеть',
  'ассистент', // cyrillic-ok: matched words
  'agent',
  'bot',
  'assistant',
  // the addressee: "Тебе отправила видео" is the agent's (#3693 round 4)
  'тебе',
  'тебя',
  'вам',
  'вас',
  'нам',
  'мне', // cyrillic-ok: matched words
  'you',
  'me',
])
/*
 * A name governed by a preposition is not the subject (#3693 round 4):
 * "Для Анны сделала", "По просьбе Марии сделала", "Через Kie сгенерировала",
 * "В стиле Нуар сделала". Each list fix of rounds 2-3 uncovered one more
 * POSITION a capital can stand in, so this is positional, not a list of
 * names: a preposition among the two words before the capital makes it
 * oblique. The price: "в чате Анна прислала" reads as the agent's and gets
 * a needless note -- the safe side of a miss.
 */
const PREPOSITION = new Set([
  'для',
  'по',
  'в',
  'во',
  'на',
  'через',
  'от',
  'у',
  'к',
  'ко',
  'с',
  'со', // cyrillic-ok: matched words
  'из',
  'про',
  'под',
  'при',
  'за',
  'о',
  'об', // cyrillic-ok: matched words
  // #3734: a preposition right before an object makes it oblique ("ссылку на // cyrillic-ok: quoted input
  // фото"); in ownVerb these only read one more capital as the agent's // cyrillic-ok: quoted input
  'без',
  'кроме',
  'вместо',
  'после',
  'до',
  'перед',
  'над',
  'между', // cyrillic-ok: matched words
  'about',
  'of',
  'after',
  'before',
  'without',
  'except',
  'for',
  'in',
  'on',
  'via',
  'from',
  'to',
  'with',
  'at',
  'by',
])
/*
 * A capital before the verb is ambiguous: "Анна записала" names someone,
 * "Утром сделала" opens the agent's sentence. Rounds 2-6 of #3693 and #3723
 * closed the list on the agent's side -- sentence adverbs read as the
 * agent's, any other capital as a name -- and every round found one more
 * opener the list missed, each a silent miss. So the list is closed on the
 * OTHER side (#3723): a capital is someone else's only when it has a
 * person's shape (personShaped). A name this list lacks gets a needless note
 * -- the safe side of a miss.
 */
export const FIRST_NAMES: ReadonlySet<string> = new Set(
  [
    // Russian, full and everyday forms, nominative (a subject is nominative),
    // written with ye for yo (nameKey)
    'александр александра алексей алена алина алиса алла анастасия анатолий',
    'андрей анжела анна антон арина арсений артем борис вадим валентин',
    'валентина валерий валерия варвара василий вера вероника виктор виктория',
    'виталий владимир владислав галина георгий глеб григорий даниил дарья денис',
    'диана дмитрий евгений евгения егор екатерина елена елизавета жанна захар',
    'зоя иван игорь илья инна ирина карина кирилл кристина ксения лариса лев',
    'леонид лидия лилия любовь людмила максим маргарита марина мария матвей',
    'милана михаил надежда наталья наталия никита николай нина оксана олег',
    'ольга павел петр полина роман руслан светлана семен сергей софия софья',
    'станислав степан тамара татьяна тимофей тимур ульяна федор эдуард',
    'элина юлия юрий яна ярослав ярослава',
    'саша маша даша паша миша гриша наташа катя лена таня оля аня ира юля',
    'света настя ксюша женя дима сережа леша вова костя толя',
    'коля петя вася витя ваня рома влад стас макс лиза соня поля вика',
    'кристи лера алеша марго',
    // English and Latin-script names a Russian line carries as written
    'anna maria olga elena ivan alex alexander alexey andrew anton boris daniel',
    'david dmitry elizabeth emily emma george helen jack james jane john julia',
    'kate kevin laura linda mark mary michael mike nick nina oliver paul peter',
    'robert sam sarah sergey sophia tom victor william',
  ]
    .join(' ')
    .split(' ')
)

// Pyotr is spelled with and without the yo letter: look names up with yo
// read as ye, so the list carries one form (#3728 review).
function nameKey(word: string): string {
  return word.toLowerCase().replace(/ё/g, 'е') // cyrillic-ok: matched letters
}

/*
 * A surname has a surname's shape (#3728 round 3): any capital after a first
 * name read as one, so "Анна Готово сделала" -- the agent greeting Anna, then
 * its own sentence -- stayed quiet. Russian surnames and patronymics end in a
 * few suffixes, on a stem of three letters or more ("Снова", "Только" are
 * not surnames); a surname without one gets a needless note, the safe side.
 */ // cyrillic-ok: quoted input
const SURNAME =
  /^\p{Lu}\p{L}{2,}(?:ов|ова|ев|ева|ёв|ёва|ин|ина|ын|ына|ский|ская|цкий|цкая|енко|ук|юк|ович|евич|ич|овна|евна|ична|инична)$/u // cyrillic-ok: matched suffixes
const LATIN = /^\p{Script=Latin}+$/u

/*
 * Someone else's subject: a known first name, a surname-shaped word after a
 * first name ("Елена Петровна", "Ксюша Петрова"), any Latin capital after a
 * Latin first name ("Anna Smith"), or a capital right after a role word
 * ("Клиентка Мария"). Anything else capitalised -- "Утром", "Значит",
 * "Готово", "Канва" -- reads as the agent's.
 */ // cyrillic-ok: quoted input
function personShaped(words: string[], at: number): boolean {
  const word = words[at]
  if (FIRST_NAMES.has(nameKey(word))) return true
  const prev = words[at - 1]
  if (!prev) return false
  if (OTHER_SUBJECT.has(prev.toLowerCase())) return true
  if (!FIRST_NAMES.has(nameKey(prev))) return false
  if (LATIN.test(prev) && LATIN.test(word)) return true
  return SURNAME.test(word)
}
/*
 * A clause starts after a comma, a colon, a dash, a bracket, "and", a line
 * break, an emoji or any other symbol (#3728 round 3): "Анна 🙌 Готово cyrillic-ok: quoted input
 * сделала" and "Анна\nГотово сделала" greet Anna, then start the agent's own cyrillic-ok: quoted input
 * clause. "@" stays inside, it marks a handle; "-" inside a word too.
 */ // cyrillic-ok: quoted input
const CLAUSE_BREAK = /[^\p{L}\p{N}\p{M} @'’-]|\s-\s|(?<!\p{L})и(?!\p{L})/gu // cyrillic-ok: matched words
// a name right after a greeting is the addressee, not the subject
const GREETING = new Set([
  'привет',
  'здравствуй',
  'здравствуйте',
  'здрасте',
  'добрый',
  'доброе',
  'доброй',
  'дорогая',
  'дорогой',
  'уважаемая',
  'уважаемый', // cyrillic-ok: matched words
  'hi',
  'hello',
  'hey',
  'dear',
])

function ownVerb(sentence: string, m: RegExpMatchArray): boolean {
  const verbAt = (m.index ?? 0) + (m[1] ?? '').length
  // a capitalised verb inside a sentence opens its own clause: "Анна // cyrillic-ok: quoted input
  // Сделала афишу" greets, then claims (#3728 round 3) // cyrillic-ok: quoted input
  if (/\p{Lu}/u.test(sentence[verbAt] ?? '')) return true
  const head = sentence.slice(0, verbAt)
  const clause = head.split(CLAUSE_BREAK).pop() ?? ''
  const words = clause.match(/\p{L}+(?:-\p{L}+)*/gu) ?? []
  const before = words.at(-1)
  if (!before) return true
  const low = before.toLowerCase()
  if (AGENT_SELF.has(low)) return true
  if (OTHER_SUBJECT.has(low)) return false
  // "@anna" is a handle, someone else's however it is cased
  if (clause[clause.lastIndexOf(before) - 1] === '@') return false
  if (before[0] === low[0]) return true
  const at = words.length - 1
  // A preposition anywhere earlier in the clause makes the capital oblique:
  // a name three words after "for" is still oblique (#3693 round 5).
  const lead = words.slice(0, at)
  if (lead.some(w => PREPOSITION.has(w.toLowerCase()))) return true
  if (!personShaped(words, at)) return true
  // a greeting earlier in the sentence makes the name the addressee:
  // "Привет, Анна сделала афишу" is the agent's (#3728 round 3) // cyrillic-ok: quoted input
  const said = head.match(/\p{L}+/gu) ?? []
  return said.some(w => GREETING.has(w.toLowerCase()))
}

/*
 * "Did I send the audio file?" asks: the claim's OWN clause ends in a
 * question mark (#3693 round 2). A dash, a bracket, a newline or an emoji
 * ends the clause first, so "Сделала афишу — как тебе?" still claims. A
 * verb-led claim asks only when the "?" closes the matched word itself
 * ("Записал голосовое?"), so "Сделала афишу нравится?" claims too.
 */
const CLAUSE_END = /\n|[^\p{L}\p{N} '’"«»-]|(?<!\p{L})-|-(?!\p{L})/u

function asked(sentence: string, m: RegExpMatchArray, verbLed: boolean) {
  const rest = sentence.slice((m.index ?? 0) + m[0].length)
  const end = rest.search(CLAUSE_END)
  if (end < 0 || rest[end] !== '?') return false
  return !verbLed || /^\p{L}*$/u.test(rest.slice(0, end))
}

/*
 * Does the gap between the verb and its object stay inside the verb's own
 * clause (#3734)? The regex lets any run of words through; this bounds it.
 * - No clause break (CLAUSE_BREAK: a symbol, " - ", "и"). A line break before // cyrillic-ok: quoted input
 *   a small letter or a digit is a wrapped line (round 4), not a break; one
 *   before a capital starts a new clause.
 * - Every word in it is gap-shaped (gapShaped, round 2): an addressee
 *   pronoun, a person's name in an oblique case, a time or manner adverb, a
 *   number, an article or an adjective. Round 1 let any word through, and the
 *   gap swallowed the verb's REAL object: "Сделала сценарий видео" made a // cyrillic-ok: quoted input
 *   script, "Отправила вам ссылку на оплату видео" a link, "I made sure the // cyrillic-ok: quoted input
 *   poster is right" made nothing at all. Telling a noun from the rest needs
 *   a dictionary the module does not have, so the list is closed on the gap's
 *   side: a word it lacks ends the match, and the claim stays silent -- what
 *   main did for every gapped claim, so never worse than main.
 * - No preposition right before the object: "Сделала текст для афиши" made // cyrillic-ok: quoted input
 *   a text, not a poster. "для" is gap-shaped only before a person: "для // cyrillic-ok: quoted input
 *   Анны", "для вас". // cyrillic-ok: quoted input
 * - For a Russian verb, no other subject inside the gap: "Прислала Анна // cyrillic-ok: quoted input
 *   фото" is Anna's verb, inverted. The same person rule as before the verb. // cyrillic-ok: quoted input
 */
const GAP_WORD = new Set([
  // the addressee, in the dative
  'мне',
  'тебе',
  'вам',
  'нам',
  'ему',
  'ей',
  'им',
  'себе',
  'лично', // cyrillic-ok: matched words
  // time and manner
  'только',
  'что',
  'уже',
  'сегодня',
  'утром',
  'днём',
  'днем',
  'вечером',
  'ночью',
  'вчера',
  'сейчас',
  'сразу',
  'недавно',
  'ещё',
  'еще',
  'тоже',
  'также',
  'наконец',
  'снова',
  'опять',
  'заново',
  'повторно',
  'специально',
  'быстро',
  'срочно',
  'вот',
  'тут',
  'здесь', // cyrillic-ok: matched words
  // how many
  'все',
  'всё',
  'один',
  'одну',
  'одно',
  'два',
  'две',
  'три',
  'четыре',
  'пять',
  'пару',
  'несколько', // cyrillic-ok: matched words
  'you',
  'her',
  'him',
  'them',
  'me',
  'us',
  'just',
  'now',
  'already',
  'today',
  'tonight',
  'this',
  'morning',
  'evening',
  'yesterday',
  'finally',
  'also',
  'again',
  'quickly',
  'here',
  'the',
  'a',
  'an',
  'your',
  'new',
  'another',
  'fresh',
  'final',
  'two',
  'three',
  'four',
  'five',
  'six',
  'several',
  'both',
  'few',
  'these',
  'those',
  'more',
  'all',
])
// a pronoun in the genitive, gap-shaped right after the preposition "for"
const FOR_WHOM = new Set([
  'тебя',
  'вас',
  'меня',
  'нас',
  'него',
  'неё',
  'нее',
  'них',
  'себя', // cyrillic-ok: matched words
])
// a Russian adjective in the accusative: "новую", "готовые", "другое" // cyrillic-ok: quoted input
const ADJECTIVE = /^\p{Ll}{2,}(?:ую|юю|ое|ее|ый|ой|ые|ых|их)$/u // cyrillic-ok: matched endings
// a name in an oblique case: "Анне", "Ивану", "Марии", "Игорю", "Анны" // cyrillic-ok: quoted input
const CASE_ENDING = ['ой', 'ей', 'е', 'у', 'ю', 'и', 'ы', 'а', 'я', ''] // cyrillic-ok: matched endings
const NOMINATIVE_END = ['', 'а', 'я', 'й', 'ь'] // cyrillic-ok: matched endings
const SURNAME_OBLIQUE =
  /^\p{Lu}\p{L}{2,}(?:ову|еву|ёву|ину|ыну|овой|евой|иной|ыной|скому|ской|цкому|цкой|енко|уку|юку|ичу|овне|евне|ичне)$/u // cyrillic-ok: matched suffixes

function nameInGap(words: string[], at: number): boolean {
  const word = words[at]
  if (word[0] === word[0].toLowerCase()) return false
  const key = nameKey(word)
  for (const end of CASE_ENDING) {
    if (!key.endsWith(end)) continue
    const stem = key.slice(0, key.length - end.length)
    if (NOMINATIVE_END.some(n => FIRST_NAMES.has(stem + n))) return true
  }
  const prev = words[at - 1]
  if (!prev || !nameInGap(words, at - 1)) return false
  if (LATIN.test(prev) && LATIN.test(word)) return true
  return SURNAME_OBLIQUE.test(word)
}

function gapShaped(words: string[], at: number): boolean {
  const word = words[at]
  const low = word.toLowerCase()
  if (GAP_WORD.has(low) || /^\p{N}+$/u.test(word)) return true
  if (ADJECTIVE.test(word) || nameInGap(words, at)) return true
  if (FOR_WHOM.has(low)) return words[at - 1]?.toLowerCase() === 'для' // cyrillic-ok: matched word
  if (low !== 'для') return false // cyrillic-ok: matched word
  const next = words[at + 1]
  return (
    !!next && (FOR_WHOM.has(next.toLowerCase()) || nameInGap(words, at + 1))
  )
}
const ONE_BREAK = new RegExp(CLAUSE_BREAK.source, 'u')

function gapHolds(sentence: string, m: RegExpMatchArray, verbLed: boolean) {
  const at = m.indices?.groups?.gap
  if (!at || at[0] === at[1]) return true
  // the gap and the first letter of the object, as the clause rules read it
  const gap = sentence
    .slice(at[0], at[1] + 1)
    .replace(/\n(?=[\p{Ll}\p{N}])/gu, ' ')
    .slice(0, -1)
  if (ONE_BREAK.test(gap)) return false
  const words = gap.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu) ?? []
  if (!words.every((_, i) => gapShaped(words, i))) return false
  if (PREPOSITION.has(words.at(-1)!.toLowerCase())) return false
  if (!verbLed) return true
  return !words.some(
    (w, i) =>
      OTHER_SUBJECT.has(w.toLowerCase()) ||
      (w[0] !== w[0].toLowerCase() && personShaped(words, i))
  )
}

const everyMatch = (c: { re: RegExp }) =>
  new RegExp(c.re.source, c.re.flags.replace('g', '') + 'g')

/* A verb-led Russian claim: its group 1 is the boundary before the verb. */
const VERB_LED = (c: { re: RegExp }) => c.re.source.includes('(?<!')

// every match counts: "Anna sent a photo, and I sent the poster" claims (round 2)
// every family matches s.flat; the breaks are read from s.text, where "\n"
// is the only character that is not a plain space (#3728 rounds 4-6)
function claimedIn(c: (typeof CLAIMS)[number], s: Sentence) {
  const verbLed = VERB_LED(c)
  const matches = [...s.flat.matchAll(everyMatch(c))].filter(m =>
    gapHolds(s.text, m, verbLed)
  )
  if (kindOf(c) === 'browser') return matches.length > 0
  if (s.back) return false
  for (const m of matches) {
    if (modifierOnly(s, m)) continue
    if (asked(s.text, m, verbLed)) continue
    if (!verbLed || ownVerb(s.text, m)) return true
  }
  return false
}

// reads normalised text only: see normalised()
function unbacked(norm: string, events: Array<Record<string, unknown>>) {
  const sentences = sentencesOf(norm)
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
  return kindsOf(unbacked(normalised(text), events))
}

function kindsOf(claims: typeof CLAIMS): ClaimKind[] {
  const kinds = new Set(claims.map(kindOf))
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
  const claims = unbacked(normalised(text), events)
  return {
    claim: kindsOf(claims).join('+'),
    unbacked: toolsOf(claims),
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
  return kindsOf(unbacked(normalised(text), events))
    .map(k => NOTES[k])
    .join('')
}
