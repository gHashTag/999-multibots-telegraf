#!/usr/bin/env node
/**
 * Validator for an autopilot topic queue (loop/topics.json and candidates).
 *
 * WHY THIS EXISTS. The queue is the only human-written input to the factory,
 * and nothing between the file and the published reel checks it. A malformed
 * entry does not crash the autopilot -- it publishes. Three defects that are
 * visible in the live feed right now went out exactly that way:
 *   - three titles read "t27.ai/#/blog: ..." because the A/B "B" style prints
 *     the first plate whose value merely CONTAINS a digit, and the blog plate
 *     value "t27.ai/#/blog" contains the "27";
 *   - eleven of the last twenty titles are English in a Russian channel;
 *   - one subtitle is cut mid-word.
 * None of them is a crash, so no exit code ever reported them.
 *
 * Every rule below is bounded by something measured in this repo or in the
 * live feed on 2026-08-31, not by taste. The measurement is named in the rule.
 *
 * LINE NUMBERS BELOW ARE FROM COMMIT 84a79abd, which is what is deployed. A
 * parallel uncommitted change was rewriting agent-autopilot.ts in this working
 * tree while this file was written (667 -> 760 lines), so the numbers drift.
 * The SYMBOL NAMES are the durable anchor -- grep for those, not for the line.
 *
 * VERDICT IS THE EXIT CODE:
 *   0 - every file passed
 *   1 - at least one rule violated (details on stdout)
 *   2 - usage error or unreadable/unparsable file
 *
 * Usage: node loop/validate-topics.mjs loop/topics.week1.candidate.json [more...]
 */
import fs from 'node:fs'
import path from 'node:path'

/**
 * The longest title this pipeline has ever actually rendered.
 *
 * Measured from GET /api/feed?limit=100 on 2026-08-31: max(len(name)) = 58
 * over all 38 published reels. Anything longer is untested in the engraving
 * layout, so the gate refuses it rather than discovering the overflow in the
 * channel. The B-style prefix counts: it is part of what gets rendered.
 */
const MAX_TITLE = 58

/**
 * The length the pipeline itself already treats as the subtitle maximum:
 * blogTopics() cuts descriptions with .slice(0, 110) (agent-autopilot.ts:144).
 * A hand-written subtitle longer than that would render longer than anything
 * the blog path can produce -- again untested.
 */
const MAX_SUBTITLE = 110

/**
 * Only three topic tags survive publication. The description is built as
 * ['#TrinityS3AI', '#t27', ...topic.tags].slice(0, 5) at agent-autopilot.ts:539
 * -- two constants plus three. A fourth tag is silently dropped, and a dropped
 * tag also never earns a score in pickTopic, so it is worse than absent.
 */
const MAX_TAGS = 3

/** Looks like a URL or a domain rather than a measurement. */
const URLISH = /https?:|\/|[a-z]\.[a-z]{2,}/i

const DIGIT = /\d/
/** A measurement begins with its number; `t27.ai/#/blog` does not. */
const LEADING_NUMBER = /^[-−+≤≥~]?\d/

/** One violation: file, index, rule id, human sentence. */
function violation(list, index, rule, message) {
  list.push({ index, rule, message })
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * Reproduces the B-style title exactly as agent-autopilot.ts:399-408 builds it.
 * Kept as a copy on purpose: the point of the check is to predict what THAT
 * code will print, so it has to model that code and not a tidier version.
 */
/**
 * The headline the B style would actually print.
 *
 * THE PREDICATE CHANGED UNDER THIS RULE, ON PURPOSE. It used to be
 * `/\d/.test(value)` -- "contains a digit anywhere" -- which a domain satisfies
 * through its own name, and that is how "t27.ai/#/blog: …" reached the feed in
 * gold. agent-autopilot.ts now requires the value to BEGIN with a number,
 * because that is what a measurement looks like. This mirror moves with it: a
 * validator that models the old behaviour would keep failing queues that are
 * now fine, and would stop catching the case it exists for.
 */
function renderedTitle(topic) {
  const plate = (topic.plates || []).find(pl =>
    LEADING_NUMBER.test(String(pl?.value).trim())
  )
  if (!plate) return { title: topic.title, plate: null }
  const value = String(plate.value)
  if (String(topic.title).startsWith(value)) {
    return { title: topic.title, plate }
  }
  return { title: `${value}: ${topic.title}`, plate }
}

function checkFile(file) {
  const bad = []
  const notices = []
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (e) {
    console.error(`[validate-topics] cannot read ${file}: ${e.message}`)
    process.exit(2)
  }
  let topics
  try {
    topics = JSON.parse(raw)
  } catch (e) {
    console.error(`[validate-topics] ${file} is not JSON: ${e.message}`)
    process.exit(2)
  }
  // R0: the autopilot does JSON.parse and then indexes an array. A non-array
  // reaches topics.length === undefined and the cycle logs an empty queue.
  if (!Array.isArray(topics)) {
    console.error(`[validate-topics] ${file}: top level must be an array`)
    process.exit(2)
  }
  if (topics.length === 0) {
    console.error(`[validate-topics] ${file}: empty queue`)
    process.exit(2)
  }

  const seen = new Map()
  topics.forEach((t, i) => {
    // R1: the five fields agent-autopilot.ts:46-52 declares and :411-420 reads.
    for (const field of ['title', 'subtitle', 'lesson']) {
      if (!isNonEmptyString(t?.[field])) {
        violation(bad, i, 'R1', `поле «${field}» пустое или не строка`)
      }
    }
    if (!Array.isArray(t?.tags) || t.tags.length === 0) {
      violation(bad, i, 'R1', 'tags пустой')
    } else {
      if (t.tags.length > MAX_TAGS) {
        violation(
          bad,
          i,
          'R2',
          `тегов ${t.tags.length}, до публикации доедут только ${MAX_TAGS}`
        )
      }
      t.tags.forEach(tag => {
        if (!isNonEmptyString(tag)) violation(bad, i, 'R1', 'пустой тег')
        // A tag with a space or a '#' breaks the hashtag it becomes: the
        // scoring regex in pickTopic accepts only word characters after the
        // hash, so it matches the first word and the rest earns no score.
        else if (/[\s#]/.test(tag))
          violation(bad, i, 'R2', `тег «${tag}» содержит пробел или решётку`)
      })
    }
    if (!Array.isArray(t?.plates) || t.plates.length === 0) {
      violation(bad, i, 'R1', 'plates пустой')
    } else {
      t.plates.forEach((pl, j) => {
        if (!isNonEmptyString(pl?.label) || !isNonEmptyString(pl?.value)) {
          violation(bad, i, 'R1', `табличка ${j}: label или value пусты`)
        }
      })
    }

    if (!isNonEmptyString(t?.title)) return

    // R3: duplicate titles. The autopilot's only duplicate guard compares the
    // title against the feed (agent-autopilot.ts:383). Two identical titles in
    // the queue therefore burn a slot: the second is skipped and the cursor
    // moves on, so the day loses a post silently.
    const dup = seen.get(t.title)
    if (dup !== undefined) {
      violation(bad, i, 'R3', `название повторяет тему №${dup}`)
    } else {
      seen.set(t.title, i)
    }

    // R4: the trap this rule was written for is fixed in the producer, so the
    // rule now guards the fix rather than describing the bug. A value that
    // begins with a number but is still an address (say "27.ai") would slip
    // past the predicate, and that is exactly what this catches.
    const { title: shown, plate } = renderedTitle(t)
    if (plate && URLISH.test(String(plate.value))) {
      violation(
        bad,
        i,
        'R4',
        `в заголовок уйдёт «${plate.value}» — это адрес, а не измерение`
      )
    }
    if (!plate) {
      notices.push(
        `№${i}: ни в одной табличке нет цифры — B-стиль напечатает заголовок как есть`
      )
    }

    // R5: rendered length, B-style prefix included.
    if (shown.length > MAX_TITLE) {
      violation(
        bad,
        i,
        'R5',
        `заголовок в кадре ${shown.length} символов при пределе ${MAX_TITLE}`
      )
    }

    // R6: subtitle length.
    if (isNonEmptyString(t.subtitle) && t.subtitle.length > MAX_SUBTITLE) {
      violation(
        bad,
        i,
        'R6',
        `подзаголовок ${t.subtitle.length} символов при пределе ${MAX_SUBTITLE}`
      )
    }

    // R7: the optional portrait. The render image ships zero media files
    // (git ls-files apps/vibee-editor/render/public -> 0), so a relative path
    // cannot resolve inside the container; only an absolute URL can.
    if (t.avatarVideo !== undefined) {
      if (!isNonEmptyString(t.avatarVideo)) {
        violation(bad, i, 'R7', 'avatarVideo пустой')
      } else if (!/^https:\/\//.test(t.avatarVideo)) {
        violation(
          bad,
          i,
          'R7',
          'avatarVideo должен быть абсолютной https-ссылкой: в образе рендера нет ни одного медиафайла'
        )
      } else if (/\.(mp4|webm|mov)$/i.test(t.avatarVideo)) {
        // Not an error: the Medallion renders video too (TrinityBlogReel.tsx:604).
        // It renders it MUTED, though, so a talking take put here loses its voice.
        notices.push(
          `№${i}: avatarVideo — видео, медальон покажет его без звука (muted)`
        )
      }
    }
  })

  const withAvatar = topics.filter(t => t.avatarVideo !== undefined).length
  if (withAvatar > 0) {
    notices.push(
      `avatarVideo стоит у ${withAvatar} тем и СЕГОДНЯ НЕ ЧИТАЕТСЯ: props собираются из фиксированного списка полей (agent-autopilot.ts:411-420). Нужна правка P1 из docs/content-plan-voice-face.md §9.2`
    )
  }

  const name = path.relative(process.cwd(), file) || file
  for (const n of notices) console.log(`  NOTICE ${name}: ${n}`)
  if (bad.length === 0) {
    console.log(`  OK     ${name}: ${topics.length} тем, нарушений нет`)
    return 0
  }
  for (const v of bad) {
    const title = String(topics[v.index]?.title || '').slice(0, 40)
    console.log(
      `  FAIL   ${name} №${v.index} [${v.rule}] ${v.message} — «${title}»`
    )
  }
  console.log(
    `  FAIL   ${name}: нарушений ${bad.length} из ${topics.length} тем`
  )
  return 1
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: node loop/validate-topics.mjs <topics.json> [...]')
  process.exit(2)
}
let worst = 0
for (const f of files) worst = Math.max(worst, checkFile(f))
process.exit(worst)
