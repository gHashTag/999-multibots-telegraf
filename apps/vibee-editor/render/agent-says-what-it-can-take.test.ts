import { describe, it, expect } from 'vitest'
import { systemPrompt } from './src/agent/chat'
import {
  TEXT_LIKE_EXTENSIONS,
  isTextLikeDocument,
} from './src/agent/media-library'

/**
 * THE AGENT SAYS WHAT IT CAN TAKE, AND WHAT IT SAYS IS TRUE.
 *
 * Owner, 2026-09-20: "make the agent support voice and every kind of file --
 * .md and all text files -- so it can be promised; and tell the user straight
 * away, explaining the steps ahead."
 *
 * Both halves were failures of SPEECH rather than of capability: the agent
 * could already hear a voice note and read a .md, and said neither, so a
 * person had to discover it by trying -- and most people do not try twice.
 *
 * The danger in fixing it by writing a sentence is the obvious one: a promise
 * in a prompt and a regex in a reader are two statements of one fact, and they
 * drift. The drift that matters is the direction where the product promises a
 * format it refuses. That is what this file exists to make impossible.
 */
/*
 * Built from string literals rather than written as regex literals: the
 * no-cyrillic gate reads a pattern as code and is right to -- a letter that
 * merely looks Latin changes a pattern's meaning invisibly.
 */
const HEARS = new RegExp('голосовые', 'i') // cyrillic-ok: prompt copy
const SEES = new RegExp('фото', 'i') // cyrillic-ok: prompt copy
const NEXT_STEP = new RegExp('ШАГИ ВПЕРЁД') // cyrillic-ok: prompt copy

describe('what the agent promises about files', () => {
  /*
   * EVERY FORMAT NAMED IS A FORMAT THAT OPENS. Walked one by one rather than
   * asserted as a string: a list that merely appears in the prompt proves
   * nothing about the reader.
   */
  it('names only formats the reader actually opens', () => {
    const prompt = systemPrompt('bot')
    for (const ext of TEXT_LIKE_EXTENSIONS) {
      expect(prompt, `promised but missing from the prompt: .${ext}`).toContain(
        `.${ext}`
      )
      expect(
        isTextLikeDocument(null, `brief.${ext}`),
        `promised but the reader refuses it: .${ext}`
      ).toBe(true)
    }
  })

  /*
   * A FLOOR THE LIST MAY NEVER DROP BELOW.
   *
   * The test above walks TEXT_LIKE_EXTENSIONS, so it proves the promise and
   * the reader AGREE -- and agrees just as happily when both shrink. Deleting
   * 'md' from the array survived it completely. These are the formats the
   * owner named on 2026-09-20 ("`.md` and all text files, so it can be
   * promised"); losing any of them is a broken promise to a person, not a
   * refactor, and must fail here.
   */
  it('always takes the formats that were promised out loud', () => {
    for (const ext of ['md', 'txt', 'csv', 'json']) {
      expect(
        TEXT_LIKE_EXTENSIONS,
        `.${ext} was promised to the owner and is gone from the list`
      ).toContain(ext)
      expect(isTextLikeDocument(null, `brief.${ext}`)).toBe(true)
      expect(systemPrompt('bot')).toContain(`.${ext}`)
    }
  })

  /*
   * AND IT NAMES WHAT IT CANNOT OPEN. A person who sends a PDF and gets a
   * vague answer concludes the agent is stupid, not that the format is
   * unsupported -- so the refusal has to be said out loud, in advance.
   */
  it('names the formats it cannot open, instead of staying quiet', () => {
    const prompt = systemPrompt('bot')
    for (const ext of ['pdf', 'docx', 'xlsx']) {
      expect(prompt).toContain(`.${ext}`)
      expect(isTextLikeDocument(null, `brief.${ext}`)).toBe(false)
    }
  })

  it('says it hears recordings and sees pictures', () => {
    const prompt = systemPrompt('bot')
    expect(prompt).toMatch(HEARS)
    expect(prompt).toMatch(SEES)
  })

  /*
   * THE SAME PROMISE IN THE BUSINESS DM. Owner, in the same breath: "and in
   * the DMs too?" A client writing to the owner's own account meets the same
   * agent, and a capability that exists on one surface and is announced on the
   * other is worse than one that exists nowhere.
   */
  it('makes the same promise in the business DM', () => {
    const dm = systemPrompt('business')
    for (const ext of TEXT_LIKE_EXTENSIONS) {
      expect(dm, `not promised in the DM: .${ext}`).toContain(`.${ext}`)
    }
    expect(dm).toMatch(HEARS)
  })

  /*
   * SAY THE NEXT STEP BEFORE TAKING IT. Silence during a job reads as a hung
   * bot from the other side, and that costs more than any extra line.
   */
  it('tells the agent to narrate what happens next', () => {
    expect(systemPrompt('bot')).toMatch(NEXT_STEP)
    expect(systemPrompt('business')).toMatch(NEXT_STEP)
  })

  /*
   * EXCEPT TO NOBODY. The unattended sweep has no person on the other side;
   * it must call tools, not explain itself to an empty room.
   */
  it('does not explain itself to the unattended sweep', () => {
    expect(systemPrompt('bot', true)).not.toMatch(NEXT_STEP)
  })
})
