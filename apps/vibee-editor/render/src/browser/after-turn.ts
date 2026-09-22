/**
 * The work report (report.ts) wired to the real journal, film and Telegram.
 * Kept out of agent/routes.ts so the route gains one line, not a subsystem.
 */
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Queryable } from './sessions'
import { readJournal } from './journal'
import { takeFilm, filmToMp4, LABEL_FONT } from './film'
import { existsSync } from 'node:fs'
import { reportBrowserWork } from './report'
export { taskText } from './report'
import { sendToTelegram, sendVideoToTelegram } from '../auth/telegram-sender'

const execFileAsync = promisify(execFile)

/** Two minutes is far more than forty frames take; a hung ffmpeg must end. */
const FILM_TIMEOUT_MS = 120_000

export function reportAfterTurn(
  pool: Queryable,
  telegramId: string,
  turn: { since: number; task: string; answer: string; settle?: boolean }
): Promise<'silent' | 'sent' | 'failed'> {
  return reportBrowserWork(
    {
      readSteps: () => readJournal(pool, telegramId, 200),
      sendText: (text, markup) => sendToTelegram(telegramId, text, markup),
      sendVideo: (mp4, caption) =>
        sendVideoToTelegram(telegramId, mp4, caption),
      film: async () => {
        const frames = takeFilm(telegramId, turn.since)
        const mp4 = await filmToMp4(
          frames,
          (bin, args) =>
            execFileAsync(bin, args, {
              timeout: FILM_TIMEOUT_MS,
              maxBuffer: 1024 * 1024,
            }),
          { mkdtemp, writeFile, readFile, rm },
          tmpdir(),
          existsSync(LABEL_FONT) ? LABEL_FONT : null
        )
        return { mp4, frames: frames.length }
      },
      /* A quiet external agent has long since finished writing its steps. */
      ...(turn.settle === false ? { settle: async () => {} } : {}),
    },
    turn
  )
}
