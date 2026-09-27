#!/usr/bin/env node
/**
 * tri busy -- is the render doing something a redeploy would cut?
 *
 * Journal rule 2 of the story loop: do not merge into the render while a
 * story job runs -- a deploy stops the container and the job's paid calls
 * start again. Until loop turn 6 (27.09.2026) this was checked by eye: sixty
 * lines of Railway log JSON, pairing "started" with "ended" in one's head.
 * That turn the eye had to pair `[agent:turn]` start and end lines of the
 * owner's own turns too (one ran 193 s across the check).
 *
 * Reads logs on stdin -- the JSON the Railway MCP get-logs returns
 * ({deploy: [{timestamp, message}]}), or plain lines from `railway logs` --
 * and pairs:
 *   [story] job N: attempt A started   /  ... ended after S s
 *   [agent:turn] {"turn": id, "event": "start"}  /  "event": "end"
 * Prints what started and did not end, oldest first. Exit 1 when anything
 * is open, 0 when the render is idle, 2 when stdin held no log lines at all
 * (an empty read is not "idle": it is no evidence -- so feed an UNFILTERED
 * window of the last 15 minutes or more, not a `[story]` filter, which is
 * empty whenever nothing ran).
 *
 * Feed it the CURRENT deployment's window from its start (get-logs with
 * its deploymentId): a service-wide window across deployments came back
 * incomplete in loop turn 7 -- start lines without their end lines, then,
 * fifteen minutes later, the same window empty.
 *
 * Two things never write their "ended" and are not open: whatever a redeploy
 * cut (a `sending signal SIGTERM` / `Stopping Container` line after its
 * start) -- listed as CUT -- and an earlier attempt of a job whose next
 * attempt started (the sweep picked it up on boot).
 */
import { readFileSync } from 'node:fs'

const raw = readFileSync(0, 'utf8')
let lines = []
try {
  const j = JSON.parse(raw)
  const rows = Array.isArray(j) ? j : (j.deploy ?? j.logs ?? [])
  lines = rows.map(r => ({
    at: String(r.timestamp ?? ''),
    text: String(r.message ?? r.text ?? ''),
  }))
} catch {
  lines = raw
    .split('\n')
    .filter(l => l.trim())
    .map(l => ({ at: '', text: l }))
}

const open = new Map()
const cut = new Map()
const STORY = /\[story\] job (\d+): attempt (\d+) (started|ended)/
const TURN = /\[agent:turn\]\s*(\{.*\})/
const STOP = /sending signal SIGTERM to container|Stopping Container/
for (const { at, text } of lines) {
  if (STOP.test(text)) {
    for (const [key, since] of open) cut.set(key, since)
    open.clear()
    continue
  }
  const s = STORY.exec(text)
  if (s) {
    const job = `story job ${s[1]}`
    const key = `${job} (attempt ${s[2]})`
    // A later attempt of the same job: the earlier one is over, and one a
    // redeploy cut was picked up -- only a cut job never resumed stays CUT.
    for (const m of [open, cut])
      for (const k of [...m.keys()]) if (k.startsWith(`${job} (`)) m.delete(k)
    if (s[3] === 'started') open.set(key, at)
    continue
  }
  const t = TURN.exec(text)
  if (t) {
    try {
      const e = JSON.parse(t[1])
      const key = `agent turn ${e.turn} (${e.surface ?? '?'}, ${e.telegram_id ?? '?'})`
      if (e.event === 'start') open.set(key, at)
      else if (e.event === 'end') open.delete(key)
    } catch {
      // A line cut by the log's own limit: not evidence either way.
    }
  }
}

if (!lines.length) {
  console.log('no log lines on stdin: that is no evidence, not "idle"')
  process.exit(2)
}
// What the window covers: a window cut by the query's own line limit looks
// exactly like a quiet one (loop turn 7: 120 lines of one boot hid six
// minutes), so the span is always said.
const stamps = lines
  .map(l => l.at)
  .filter(Boolean)
  .sort()
console.log(
  stamps.length
    ? `window  ${stamps[0]} .. ${stamps[stamps.length - 1]}, ${lines.length} line(s)`
    : `window  ${lines.length} line(s), no timestamps`
)
for (const [key, at] of cut)
  console.log(
    `CUT   ${key}${at ? `  since ${at}` : ''} (a redeploy stopped it)`
  )
for (const [key, at] of open)
  console.log(`OPEN  ${key}${at ? `  since ${at}` : ''}`)
console.log(
  open.size
    ? `-- ${open.size} open: a redeploy now would cut them --`
    : `-- idle: nothing started without ending in ${lines.length} line(s) --`
)
process.exit(open.size ? 1 : 0)
