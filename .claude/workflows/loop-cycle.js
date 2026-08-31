export const meta = {
  name: 'loop-cycle',
  description:
    'One improvement cycle: measure, scout the weak points, implement, refute every claim adversarially, then a completeness critic',
  whenToUse:
    'When the owner says continue the loop / new cycle / do all three, or when cron wakes a cycle. ' +
    'args: { tracks?: [{key, why, scout, build}], focus?: "theme", skipMeasure?: true }. ' +
    'With no args it finds its own work from the live measurement and the named debt.',
  phases: [
    { title: 'Measure', detail: 'production state before any work' },
    {
      title: 'Scout',
      detail: 'one agent per track, plan grounded in real files',
    },
    { title: 'Build', detail: 'implement, prove by mutation' },
    { title: 'Refute', detail: 'a skeptic tries to break every claim' },
    { title: 'Critic', detail: 'what was left unmeasured' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────
// WHY THIS WORKFLOW HAS THIS SHAPE
//
// Every decision below was paid for by a cycle, not chosen for taste:
//
// 1. MEASURE FIRST, and it is a barrier. The only real barrier here: scouting
//    must not start before it is known what is broken NOW. A cycle that opened
//    with a plan instead of a measurement twice repaired what already worked.
//
// 2. AFTER THAT, pipeline WITH NO BARRIERS. The tracks are independent, and
//    waiting for the slowest one to reach the next stage buys nothing.
//
// 3. EVERY CLAIM IS REFUTED BY A SEPARATE AGENT told to look for a refutation
//    rather than a confirmation. In cycle 228 all three verifiers found real
//    defects in work already reported as done: a cursor that could rewind, a
//    fake blind to its own SQL, and a false green in a neighbouring section.
//    An implementer does not refute their own work; they explain it.
//
// 4. THE COMPLETENESS CRITIC AT THE END asks not "is this correct" but "what
//    was not measured". Those are different questions, and the second one finds
//    what the first does not look for.
//
// 5. NO SILENT CAPS: anything dropped is printed through log(). Silent
//    truncation reads as "we covered everything".
// ─────────────────────────────────────────────────────────────────────────

const REPO = '/Users/playra/999-multibots-telegraf'

const HOUSE_RULES = `
HOUSE RULES. Breaking any one of them wastes the whole run.

1. CODE COMMENTS AND COMMIT MESSAGES MUST BE IN ENGLISH. The gate
   scripts/no-cyrillic-guard.cjs rejects Cyrillic outside string literals in
   .ts/.tsx/.js/.mjs/.cjs. Cyrillic INSIDE string literals (text for people,
   test names, log output) is allowed and normal here. Do not touch Russian
   identifiers that were already there before you.

2. DO NOT RUN ANY GIT COMMAND THAT CHANGES STATE. No commit, checkout, branch,
   stash, reset or push. Leave your edits in the working tree; the orchestrator
   commits. Reading (log/diff/show) is fine.

3. A CHECK THAT CANNOT FAIL IS WORTHLESS. If you add or change a check, BREAK
   what it measures, confirm it goes red, then restore. Keep the copy in /tmp
   and restore FROM IT; using git reset/checkout to undo a mutation is
   FORBIDDEN -- it has already destroyed someone else's uncommitted work here.

4. A TEST DOUBLE MUST BE AS DUMB AS THE REAL THING. If the fake enforces the
   invariant the code is supposed to enforce, the test measures the fake.
   Caught twice in two cycles: a revoked filter inside a fake pool, and an
   owner filter in the same place.

5. THREE OUTCOMES, NEVER TWO: passed / failed / COULD NOT MEASURE. Unmeasured
   is never reported as passing. Take the verdict from the EXIT CODE, not from
   the text: tsc colours its output and grep -c 'error TS' has returned 0 while
   errors existed; the gate called a vitest run green that had exited 1.

6. A COMMENT EXPLAINS WHY A LINE EXISTS AND WHAT IT COST, not what it does.
   All the surrounding code is written that way -- match it.
`

const PLAN = {
  type: 'object',
  required: ['feasible', 'plan', 'files', 'risks', 'verification'],
  properties: {
    feasible: { type: 'string', enum: ['yes', 'partly', 'no'] },
    plan: {
      type: 'string',
      description: 'Steps on real files and line numbers',
    },
    files: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    verification: {
      type: 'string',
      description: 'Exactly what will prove it, including the mutation to run',
    },
    surprises: {
      type: 'array',
      items: { type: 'string' },
      description: 'Facts that contradict the framing of the task',
    },
  },
}

const BUILT = {
  type: 'object',
  required: ['done', 'summary', 'evidence', 'notDone'],
  properties: {
    done: { type: 'string', enum: ['fully', 'partly', 'blocked'] },
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    evidence: {
      type: 'string',
      description: 'Commands and EXIT CODES, including the mutation proof',
    },
    notDone: { type: 'string' },
    followups: { type: 'array', items: { type: 'string' } },
  },
}

const VERDICT = {
  type: 'object',
  required: ['claimHolds', 'findings'],
  properties: {
    claimHolds: { type: 'boolean' },
    findings: { type: 'array', items: { type: 'string' } },
    proofRun: { type: 'string' },
  },
}

const FOUND_WORK = {
  type: 'object',
  required: ['tracks'],
  properties: {
    tracks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'why', 'scout'],
        properties: {
          key: { type: 'string', description: 'short slug' },
          why: { type: 'string', description: 'what it costs RIGHT NOW' },
          scout: { type: 'string', description: 'what the scout must read' },
          build: { type: 'string' },
        },
      },
    },
  },
}

// ─── Dynamics: how many tracks to pull ───────────────────────────────────
//
// Scale comes from the cycle's budget when the owner named one ("+500k"),
// otherwise three -- as many as fit in one cycle together with refutation and
// the critic. The ceiling is hard: five tracks is fifteen agents, and past that
// the critic can no longer read everything handed to it.
const ASKED = (args && args.tracks) || null
const FOCUS = (args && args.focus) || ''
const WANT = ASKED
  ? ASKED.length
  : Math.max(
      1,
      Math.min(5, budget.total ? Math.floor(budget.total / 250_000) : 3)
    )

// ─── Phase 1. Measure. The one real barrier ──────────────────────────────
phase('Measure')
let snapshot = null
if (!(args && args.skipMeasure)) {
  const raw = await agent(
    `${HOUSE_RULES}

You are taking the state BEFORE the work. Run this in ${REPO}:

    node .claude/loop-opus/collect-status.mjs --quick

It prints JSON of measured facts: production anomalies, the alarm self-test, the
age of the last published reel, the deploy, whether any of my fixes were
overwritten, what shipped in 24 hours, and the named debt.

Return IT, verbatim, with no commentary and no conclusions of your own -- the
orchestrator parses it as JSON. If the command fails, return {"error":"<text>"}.`,
    { label: 'measure:production', phase: 'Measure' }
  )
  try {
    const m = String(raw).match(/\{[\s\S]*\}/)
    snapshot = m ? JSON.parse(m[0]) : null
  } catch {
    // An unparsed measurement is NOT "everything is fine". Carry on, say so.
    snapshot = null
  }
  if (!snapshot)
    log('measurement not parsed -- tracks chosen blind, which is worse')
  else
    log(
      `measured: anomalies ${snapshot.anomalies?.count ?? '?'}, ` +
        `factory ${snapshot.factory?.hoursSinceLastPost ?? '?'}h, ` +
        `traces ${snapshot.landed?.checked ?? '?'}/${snapshot.landed?.total ?? '?'}`
    )
}

// ─── Phase 2. What to work on ────────────────────────────────────────────
//
// Tracks are either named by the owner or DERIVED FROM THE MEASUREMENT. The
// second matters more than the first: a cycle that picks its work from the
// prose in STATE.json repairs what was broken yesterday.
let TRACKS = ASKED
if (!TRACKS) {
  const found = await agent(
    `${HOUSE_RULES}

You are choosing the work for one cycle in ${REPO}. ${FOCUS ? `Theme: ${FOCUS}` : ''}

Here is the MEASURED state (null means "not measured", never "fine"):
${JSON.stringify(snapshot, null, 2)}

Also read:
  .claude/loop-opus/STATE.json                  -- debt named by the last cycle
  .claude/skills/vibee-stack-hard-won/SKILL.md  -- lessons; the tail is freshest

Propose exactly ${WANT} tracks. Selection rules, most important first:

1. WHAT HURTS NOW beats what is ugly. An anomaly waiting on the owner's keys or
   money is NOT a track -- I cannot close it.
2. A CHECK THAT CANNOT FAIL beats a new feature. Seven of those have been found
   in this repository, and each one was hiding a real failure.
3. A PROMISE THE SYSTEM DOES NOT KEEP -- response text, help output, or a
   comment asserting something the code does not do -- beats a refactor.
4. DO NOT take anything that cannot be proven within this same cycle.

For each track give: key, why (what it costs now, with a path and a line),
scout (what exactly to read), build (what to do). Ground it in files you have
READ, not in guesses.`,
    { label: 'scout:pick-the-work', phase: 'Measure', schema: FOUND_WORK }
  )
  TRACKS = (found?.tracks || []).slice(0, WANT)
  if (found?.tracks && found.tracks.length > WANT)
    log(
      `agent proposed ${found.tracks.length} tracks, took ${WANT} -- rest go to the debt list`
    )
}

if (!TRACKS.length) {
  log('no work found -- the cycle closes empty, and that is a result too')
  return { snapshot, tracks: [], critic: null }
}
log(`tracks in flight: ${TRACKS.map(t => t.key).join(', ')}`)

// ─── Phases 3-5. Each track moves at its own pace, no barriers ───────────
phase('Scout')
const results = await pipeline(
  TRACKS,
  t =>
    agent(
      `${HOUSE_RULES}

You are scouting the track "${t.key}". Read real files, do not guess; ground
every claim in a path and a line number.

WHY THIS TRACK: ${t.why || '(not stated)'}

TASK: ${t.scout}

If the framing is wrong, say so plainly in surprises. A scout who finds there is
nothing to fix is worth more than a scout who invents work.`,
      { label: `scout:${t.key}`, phase: 'Scout', schema: PLAN }
    ),
  (plan, t) =>
    plan && plan.feasible !== 'no'
      ? agent(
          `${HOUSE_RULES}

You are implementing the track "${t.key}" in ${REPO}.

THE SCOUT'S PLAN (follow it where it is right; deviate where it is wrong, and
say exactly where and why):
${JSON.stringify(plan, null, 2)}

TASK: ${t.build || t.scout}

Required: run whatever covers what you changed, and report EXIT CODES.
Required: prove by mutation that the new check can go red.`,
          { label: `build:${t.key}`, phase: 'Build', schema: BUILT }
        )
      : (log(`${t.key}: scout says there is nothing to fix -- track dropped`),
        null),
  (built, t) =>
    built
      ? agent(
          `${HOUSE_RULES}

The implementer of track "${t.key}" claims the following:
${JSON.stringify(built, null, 2)}

YOUR JOB IS TO REFUTE IT, not to confirm it. Default to refuted when uncertain.
Specifically:

1. Run what they ran. Do the exit codes match?
2. SABOTAGE what they claim to have protected -- three different ways, in
   different places. The check must go red on each. A surviving sabotage is a
   finding.
3. Does the test pass for the RIGHT reason? Is it measuring its own fake? Does
   it assert "the list is non-empty" without looking at WHAT is in the list?
4. What broke nearby? Run the full suite of the affected package.
5. Does the SAME defect exist in a neighbouring place they did not touch?

Restore every sabotage from a /tmp copy, NEVER with git.
claimHolds=false if any sabotage survived, naming exactly which one.`,
          { label: `refute:${t.key}`, phase: 'Refute', schema: VERDICT }
        ).then(v => ({ track: t.key, built, verdict: v }))
      : { track: t.key, built: null, verdict: null }
)

const done = results.filter(Boolean)
const broken = done.filter(r => r.verdict && r.verdict.claimHolds === false)
if (broken.length)
  log(`claims refuted: ${broken.length} of ${done.length} -- read these first`)

// ─── Phase 6. The completeness critic ────────────────────────────────────
phase('Critic')
const critic = await agent(
  `${HOUSE_RULES}

A cycle has just closed in ${REPO}. Here is what the implementers reported and
what the refuters found:

${JSON.stringify(done, null, 2)}

You are the COMPLETENESS critic. Do not redo the work. Answer against the actual
state of the repository -- read files, run commands:

1. WHAT IS STILL UNMEASURED? For each track, name anything claimed as working
   whose proof is missing, weak or circular: a test that passes because of its
   own fake, a check that cannot fail, an exit code nobody read.
2. WHAT BROKE NEARBY? Run the full test suites of the affected packages and the
   root typecheck. Report EXIT CODES. Run
   'node scripts/no-cyrillic-guard.cjs range' -- if it finds Cyrillic in code
   comments, name the files and lines, because that will block the commit.
3. WHAT DID NOBODY DO? Anything in the brief that quietly went undone.
4. IS THE TREE CLEAN? 'git status --short' and 'git diff --stat': is any
   sabotage left unrestored, does any change look half-reverted?

Be specific and unsparing. If everything is genuinely fine, say so plainly
rather than inventing concerns.`,
  { label: 'critic:completeness', phase: 'Critic' }
)

return { snapshot, tracks: done, refuted: broken.length, critic }
