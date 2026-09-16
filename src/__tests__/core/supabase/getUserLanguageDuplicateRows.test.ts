/**
 * Production incident 2026-09-16 09:00:13:
 *   [WARN]: [getUserLanguageFromDB] User not found for telegram_id: 391590340
 * The row existed — the account has more than one row in `users`, and the old
 * `.maybeSingle()` demanded zero-or-one row, so PostgREST failed with PGRST116,
 * the saved language was thrown away and the bot answered a Russian speaker in
 * the wrong language. Worse, that failure went through logger.error, which is
 * bound to a Telegram transport: a customer with duplicate rows woke the owner.
 *
 * These cases are driven through the real getUserLanguageFromDB against a
 * Supabase client double that returns the REAL PostgREST shapes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { logger, queryResult } = vi.hoisted(() => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  queryResult: { value: { data: [], error: null } as any },
}))

vi.mock('@/utils/logger', () => ({ logger }))
vi.mock('@/core/supabase/client', () => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => Promise.resolve(queryResult.value),
    // If the implementation regresses to a single-row query, that is the very
    // defect under test — make it fail the way production did.
    maybeSingle: () =>
      Promise.resolve({
        data: null,
        error: {
          code: 'PGRST116',
          message:
            'JSON object requested, multiple (or no) rows returned: results contain 2 rows',
          details: 'Results contain 2 rows',
          hint: null,
        },
      }),
  }
  return { supabase: { from: () => builder } }
})

import {
  getUserLanguageFromDB,
  errorThrottle,
} from '@/core/supabase/getUserLanguage'

const ID = 391590340

describe('getUserLanguageFromDB tolerates duplicate rows and routes levels honestly', () => {
  beforeEach(() => {
    logger.error.mockClear()
    logger.warn.mockClear()
    logger.info.mockClear()
    errorThrottle.clear()
  })

  it('(a) two rows for one telegram_id: returns the saved language and pages nobody', async () => {
    // Real shape of an ordered, limited PostgREST read over a duplicated user:
    // newest updated_at first, so the row the user last wrote wins.
    queryResult.value = {
      data: [{ language_code: 'ru' }, { language_code: 'en' }],
      error: null,
    }

    const lang = await getUserLanguageFromDB(ID)

    expect(lang).toBe('ru') // the SAVED language, not a default
    expect(logger.error).not.toHaveBeenCalled() // no push to the owner's phone
  })

  it('(b) genuinely no row: documented default (null) and pages nobody', async () => {
    queryResult.value = { data: [], error: null }

    const lang = await getUserLanguageFromDB(ID)

    expect(lang).toBeNull()
    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('(c) CONTROL: a transport/permission failure STILL wakes the owner', async () => {
    queryResult.value = {
      data: null,
      error: {
        code: '42501',
        message: 'permission denied for table users',
        details: null,
        hint: null,
      },
    }

    const lang = await getUserLanguageFromDB(ID)

    expect(lang).toBeNull()
    expect(logger.error).toHaveBeenCalledTimes(1) // the loud half stayed loud
  })

  it('(c2) CONTROL: a malformed response STILL wakes the owner', async () => {
    queryResult.value = { data: { language_code: 'ru' } as any, error: null }

    await getUserLanguageFromDB(ID)

    expect(logger.error).toHaveBeenCalledTimes(1)
  })

  it('(d) the operator can tell "no row" apart from "could not ask the database"', async () => {
    queryResult.value = { data: [], error: null }
    await getUserLanguageFromDB(ID)
    const missingUserMsg = String(logger.warn.mock.calls[0][0])

    errorThrottle.clear()
    queryResult.value = {
      data: null,
      error: {
        code: 'ECONNREFUSED',
        message: 'fetch failed',
        details: null,
        hint: null,
      },
    }
    await getUserLanguageFromDB(ID)
    const dbFailureMsg = String(logger.error.mock.calls[0][0])

    expect(missingUserMsg).toMatch(/no user row exists/i)
    expect(dbFailureMsg).toMatch(/database query failed/i)
    // The two must not be the same sentence, as they were in production.
    expect(dbFailureMsg).not.toMatch(/no user row exists/i)
    expect(missingUserMsg).not.toMatch(/failed/i)
  })
})
