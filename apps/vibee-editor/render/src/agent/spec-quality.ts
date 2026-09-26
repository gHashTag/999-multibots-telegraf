/**
 * WHY THE BEES ARE SILENT, MADE PREVENTABLE (owner, 2026-09-26: "why doesn't
 * she take tasks from the backlog? improve it").
 *
 * The Queen (trios-agent-server, gHashTag/BrowserOS) refuses to start a bee on
 * an issue that is not a delegatable spec: measured on the live board, 496 open
 * issues and zero chosen, because none declares a `## Boundary` and the sections
 * a machine can check. Her choose step is right to refuse -- starting a bee on
 * an issue with no boundary means finding the collision by running into it.
 * The cure is not to loosen her gate, it is to feed her issues that pass it.
 *
 * This is that gate, mirrored so an author (a person, an agent, or this loop)
 * can PROVE an issue is delegatable before filing it, and can scaffold one that
 * already is. The authority remains the compiled engine --
 * `queen-core/Sources/QueenCore/QueenSpecQuality.swift` and
 * `QueenIssueBoundary.swift` in gHashTag/BrowserOS (read at commit c25e1b0,
 * branch fix/queen-worker-provider-and-prompt-size). This file is a preflight
 * aid, not a second source of truth: if the engine's rule moves, `--self-test`
 * here is where the drift shows, and this follows it.
 *
 * The four sections are spec-kit's three mandatory ones plus the one this
 * project adds because a supervisor allocates files to concurrent workers:
 *   boundary          `## Boundary` (or `## Границы`) listing the files touched
 *   scenarios         `## User Scenarios` / a Given-When-Then (RU or EN)
 *   requirements      `## Requirements` with an FR-NNN ... MUST obligation
 *   success criteria  `## Success Criteria` with a checkable outcome
 * Only the boundary decides `delegatable`; the rest is `isSpec` quality.
 */

/** One requirement of a spec, and whether the text satisfies it. */
export interface Check {
  name: string
  met: boolean
  /** What to add, phrased so it can be pasted into the issue. */
  remedy: string
}

export interface Verdict {
  checks: Check[]
  /** Delegatable at all. False when the boundary is missing: that one is
   * capability, everything else is quality. */
  delegatable: boolean
  /** Every mandatory section present. */
  isSpec: boolean
  /** The names of the checks that are not met. */
  missing: string[]
}

// --- QueenIssueBoundary, ported faithfully -------------------------------

/** A heading opens the boundary section. Two spellings: issues written before
 * the 2026-08-19 English rule say `## Границы`. */
function isBoundaryHeading(trimmed: string): boolean {
  return trimmed.startsWith('## Границы') || trimmed.startsWith('## Boundary') // cyrillic-ok: an issue heading token
}

/** The path-shaped token from a boundary line, or null. Strips surrounding
 * backticks and prose punctuation in a LOOP (backtick-then-comma is the common
 * shape a sequential strip leaves a dangling backtick on), splits on any
 * whitespace, and accepts a token that contains "/" or ends in a dotted
 * extension. */
export function pathToken(line: string): string | null {
  for (const raw of line.split(/\s+/).filter(Boolean)) {
    let cleaned = raw
    let changed = true
    while (changed && cleaned.length > 0) {
      changed = false
      if (cleaned.length && '`"\'('.includes(cleaned[0])) {
        cleaned = cleaned.slice(1)
        changed = true
      }
      const last = cleaned[cleaned.length - 1]
      if (cleaned.length && '`"\'.,;:!?)'.includes(last)) {
        cleaned = cleaned.slice(0, -1)
        changed = true
      }
    }
    if (!cleaned) continue
    if (cleaned.includes('/') || /\.\w{1,10}$/.test(cleaned)) return cleaned
  }
  return null
}

/** The paths an issue declares, or null when it declares no boundary section at
 * all. null and [] are different answers: no section told us nothing; an empty
 * section told us nothing on purpose. Neither means "touches no files". */
export function boundaryPaths(body: string): string[] | null {
  const lines = body.split('\n')
  let inBounds = false
  let found = false
  const paths: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('## ')) {
      if (inBounds) break
      inBounds = isBoundaryHeading(trimmed)
      if (inBounds) found = true
      continue
    }
    if (!inBounds) continue
    if (!trimmed) continue
    const token = pathToken(trimmed)
    if (token) paths.push(token)
  }
  return found ? paths : null
}

// --- QueenSpecQuality, ported faithfully ---------------------------------

/** Headings are matched case-insensitively, in both languages the repository's
 * issues are written in. */
function hasSection(body: string, names: string[]): boolean {
  const lower = body.toLowerCase()
  return names.some(n => lower.includes(`## ${n.toLowerCase()}`))
}

/** A Given/When/Then scenario, in either language. */
function hasAcceptanceScenario(body: string): boolean {
  const lower = body.toLowerCase()
  const given = ['**given**', 'given ', 'дано', 'если '] // cyrillic-ok: scenario keywords
  const then = ['**then**', 'then ', 'тогда', 'то '] // cyrillic-ok: scenario keywords
  return given.some(g => lower.includes(g)) && then.some(t => lower.includes(t))
}

/** A requirement written as an obligation rather than a hope. */
function hasObligation(body: string): boolean {
  if (/\bFR-\d{3}\b/.test(body)) return true
  const lower = body.toLowerCase()
  return (
    lower.includes(' must ') ||
    lower.includes('должен ') || // cyrillic-ok: obligation word
    lower.includes('обязан ') // cyrillic-ok: obligation word
  )
}

/** A criterion a machine or reviewer can settle: a number, a file path, a
 * command, an exit code. Adjectives close tasks that were never done. */
function hasMeasurableOutcome(body: string): boolean {
  const patterns = [
    /\b\d+\s*(ms|s|MB|GB|%|files?|lines?|tests?|attempts?)\b/i,
    /`[^`]+\.(swift|ts|rs|md|json|zig|v)`/i,
    /\bexit(s)? (0|non-zero)\b/i,
    /`(make|swift|bun|cargo|git) [^`]+`/i,
  ]
  return patterns.some(p => p.test(body))
}

/** Headings under which an issue states what "done" looks like, across the
 * repository's language change and spec rule. */
export const CRITERIA_HEADINGS = [
  'success criteria',
  'acceptance criteria',
  'acceptance',
  'done when',
  'готово, когда', // cyrillic-ok: an issue heading
  'готово когда', // cyrillic-ok: an issue heading
  'критерии успеха', // cyrillic-ok: an issue heading
  'критерии приёмки', // cyrillic-ok: an issue heading
  'критерии приемки', // cyrillic-ok: an issue heading
  'критерии', // cyrillic-ok: an issue heading
]

/** Whether an issue body is a delegatable spec, and what it still needs. */
export function judge(body: string): Verdict {
  const boundary = boundaryPaths(body)
  const hasBoundary = boundary !== null && boundary.length > 0

  const checks: Check[] = [
    {
      name: 'boundary',
      met: hasBoundary,
      remedy:
        'Add a `## Boundary` section listing every file this task may touch, ' +
        'one per line. Without it nothing can be reserved and the task cannot ' +
        'be given to anyone.',
    },
    {
      name: 'scenarios',
      met:
        hasSection(body, ['User Scenarios', 'Scenarios', 'Сценарии']) || // cyrillic-ok: heading
        hasAcceptanceScenario(body),
      remedy:
        'Add `## User Scenarios & Testing` with at least one Given/When/Then ' +
        'scenario. A task with no scenario cannot be shown to work; it can only ' +
        'be declared finished.',
    },
    {
      name: 'requirements',
      met:
        hasSection(body, ['Requirements', 'Требования']) && hasObligation(body), // cyrillic-ok: heading
      remedy:
        'Add `## Requirements` with numbered obligations - `FR-001: ... MUST ' +
        '...`. "Should" and "would be nice" cannot be judged met or unmet.',
    },
    {
      name: 'success criteria',
      met: hasSection(body, CRITERIA_HEADINGS) && hasMeasurableOutcome(body),
      remedy:
        'Add `## Success Criteria` with outcomes something can check: a number, ' +
        'a file, a command and its exit code, or a log line to grep for. ' +
        'Adjectives close tasks that were never done.',
    },
  ]

  const missing = checks.filter(c => !c.met).map(c => c.name)
  return {
    checks,
    delegatable: hasBoundary,
    isSpec: checks.every(c => c.met),
    missing,
  }
}

/** One line naming what the issue still needs. */
export function shortfall(verdict: Verdict): string | null {
  if (verdict.missing.length === 0) return null
  return `not yet a spec - missing ${verdict.missing.join(', ')}`
}

/**
 * A ready-to-fill issue body that is already delegatable AND a full spec, so an
 * author edits substance rather than guessing structure. The placeholders are
 * real enough to pass every check (a `## Boundary` path, a Given/When/Then, an
 * FR-001 MUST, a measurable Success Criterion) -- proven by the test that runs
 * `judge(scaffold(...))` and asserts `isSpec`.
 */
export function scaffold(title: string): string {
  const name = title.trim() || 'the change'
  return [
    `# ${name}`,
    '',
    'One paragraph: what is wrong or missing today, and what this task makes true.',
    '',
    '## User Scenarios & Testing',
    '',
    '- **Given** the current state, **When** this task is done, **Then** the ' +
      'observable behaviour changes in this specific way.',
    '',
    '## Requirements',
    '',
    '- **FR-001**: the system MUST <the single obligation this task adds>.',
    '',
    '## Success Criteria',
    '',
    '- A named check passes: e.g. `bun run verify` exits 0, or `path/to/file.ts` ' +
      'contains the new behaviour, or a specific log line appears.',
    '',
    '## Boundary',
    '',
    '- `path/to/the/file/this/task/may/touch.ts`',
    '',
  ].join('\n')
}
