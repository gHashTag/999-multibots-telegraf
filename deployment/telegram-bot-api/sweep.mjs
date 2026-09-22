/**
 * THE VOLUME DOES NOT FILL UP BY ITSELF -- UNTIL IT DOES.
 *
 * In `--local` mode every file a bot is asked to `getFile` is downloaded into
 * the working directory and stays there: telegram-bot-api has no expiry of its
 * own. A few people sending videos to a bot fill a Railway volume in weeks, and
 * a full volume stops the server (its database lives on the same disk).
 *
 * So media older than FILES_TTL_HOURS is removed -- and ONLY media. The sweep
 * walks `<root>/<bot>/<kind>/` for the kinds of files tdlib downloads and
 * touches nothing else: not the bot's database (`td.binlog`, `db.sqlite`), not
 * anything in the root, not a directory. Our copy of anything worth keeping is
 * already on the shelf; the file here only had to live until it was read.
 *
 * A getFile for a file swept away makes the server download it again (tdlib
 * re-checks its local copy) -- see the rollout check in README.md.
 */

import { readdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'

/** The directories tdlib downloads media into, inside each bot's directory. */
export const MEDIA_DIRS = [
  'animations',
  'documents',
  'music',
  'photos',
  'profile_photos',
  'stickers',
  'temp',
  'thumbnails',
  'video_notes',
  'videos',
  'voice',
  'wallpapers',
]

async function entries(dir) {
  try {
    return await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/**
 * Delete media files older than `maxAgeMs`. Returns how many went.
 * `now` is injectable so the rule is testable without waiting a day.
 */
export async function sweepOldMedia(root, maxAgeMs, now = Date.now()) {
  if (!(maxAgeMs > 0)) return 0
  let removed = 0
  for (const bot of await entries(root)) {
    if (!bot.isDirectory()) continue
    for (const kind of MEDIA_DIRS) {
      const dir = path.join(root, bot.name, kind)
      for (const file of await entries(dir)) {
        if (!file.isFile()) continue
        const full = path.join(dir, file.name)
        try {
          const info = await stat(full)
          if (now - info.mtimeMs > maxAgeMs) {
            await unlink(full)
            removed += 1
          }
        } catch {
          // Gone already, or being written: the next sweep decides.
        }
      }
    }
  }
  return removed
}
