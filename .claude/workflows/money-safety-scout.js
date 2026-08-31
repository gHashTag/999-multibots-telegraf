export const meta = {
  name: 'money-safety-scout',
  description:
    'Bounded whole-repo adversarial audit for the money/reliability bug classes: fan-out one detector per class, then an adversarial skeptic refutes each finding.',
  whenToUse:
    'A deep periodic audit of the WHOLE codebase (not a diff) for NEW instances of the recurrent bug classes, especially in layers no ratchet covers (api_server, inngest, core). Complements quality-gate.js (which reviews a diff). No args required. ~13 agents.',
  phases: [
    { title: 'Hunt', detail: 'one detector per bug class, whole-repo' },
    { title: 'Verify', detail: 'adversarial skeptic refutes each finding' },
  ],
}

// Agents run in the repo root (cwd); keep this env-agnostic -- no hardcoded
// absolute paths (see #1408). Each agent runs its own grep/read in cwd.
const REPO = '.'

// The scene layer is already gated by vitest ratchets (paid-wizard-guard,
// duplicate-scene-id, charge-result-checked, session-array-cap,
// crossbot-delivery, cache-invalidation-isolated). So each detector should focus
// on NEW instances in the LESS-covered layers: src/api_server, src/inngest_app,
// src/core, src/services, src/handlers -- and on subtle variants in scenes.
const CONTEXT = `You audit the repo at ${REPO} (run grep/read yourself in cwd).
The Telegram scene layer is already guarded by vitest ratchets, so hunt hardest
in src/api_server, src/inngest_app, src/core, src/services, src/handlers. Report
ONLY concrete, code-backed candidates -- an empty result is an honest answer.
For each, say whether the code path is REACHABLE (not dead/unwired/flag-disabled).`

const CLASSES = [
  {
    key: 'unbilled-paid',
    prompt: `${CONTEXT}
CLASS: a charge result is discarded. updateUserBalance / processBalanceOperation
return false on a failed debit (they do NOT throw). A caller that ignores the
result and then delivers a paid product on a failed charge = free generation.
Find: bare \`await updateUserBalance(...MONEY_OUTCOME...)\` (or processBalance*)
whose boolean result is not captured/checked, followed by delivery. Note: some
helpers (setPayments) THROW on error -> discarding their return is CORRECT; do
not flag those.`,
  },
  {
    key: 'post-commit-false-negative',
    prompt: `${CONTEXT}
CLASS: a payment/charge commits (payments_v2 insert / updateUserBalance succeeds),
then a post-commit side-effect (cache invalidation, a balance read, a notify)
inside the SAME try whose catch returns false/success:false throws and flips the
COMMITTED charge to false -> caller retries into a double charge or does not
deliver. Fixed instances: updateUserBalance #1398, directPayment #1400. Find NEW
functions with this shape (a post-commit await inside the return-guarding try).`,
  },
  {
    key: 'honesty-message',
    prompt: `${CONTEXT}
CLASS: a success message states a charge that may not have happened. A wizard/route
charges, captures \`charged\`, and shows "charged X stars" UNCONDITIONALLY even when
charged===false (logs "unbilled" but still claims the charge). Fixed: #1393, #1402.
Find any success reply/editMessageText that interpolates a charged amount without
gating it on the real charge-result flag.`,
  },
  {
    key: 'zero-cost-amplification',
    prompt: `${CONTEXT}
CLASS: a user-supplied number (parseInt/Number of message/callback text) feeds a
COST or a loop-count for a paid operation without validation -> cost floors to 0
(free paid gen) or amplifies resource use. Fixed: neuroPhoto numImages #1317,
LoRA steps (handleTrainingCost rejects cost<=0). Find a user number reaching a
charge/generation that is NOT clamped/allowlisted before the paid op.`,
  },
  {
    key: 'destructive-cleanup',
    prompt: `${CONTEXT}
CLASS: a HARD delete in a per-item loop triggered by a UNIFORM (shared) error ->
mass data loss. Or a broad .delete() not scoped by a specific id/tenant. Fixed:
broadcast #1201. Find a .delete()/DELETE that could remove more than intended on
a shared error, or an unscoped destructive op on users/payments/models.`,
  },
  {
    key: 'prompt-injection',
    prompt: `${CONTEXT}
CLASS: untrusted user identity (Telegram first_name / last_name / username, or
free user text) interpolated RAW into a role:'system' message -> prompt injection.
Fixed: answerAi #1129/#1169 (sanitizeField). Find a role:'system' content that
interpolates raw user-controlled identity/text without sanitize+demote.`,
  },
  {
    key: 'idempotency',
    prompt: `${CONTEXT}
CLASS: a credit/refund/reward with a non-deterministic idempotency key (Date.now()
/ random in inv_id) defeats a UNIQUE(inv_id) backstop -> double-credit on retry.
Or a webhook/callback that credits/refunds without any idempotency by inv_id/job.
Fixed: promo #1298. Find a MONEY_INCOME/refund path keyed non-deterministically or
un-deduplicated on a retryable (webhook/callback/button) path.`,
  },
]

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'claim', 'reachable'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          claim: {
            type: 'string',
            description: 'one sentence: what is broken',
          },
          scenario: {
            type: 'string',
            description: 'concrete input -> wrong outcome',
          },
          reachable: {
            type: 'string',
            description: 'live | dead | unsure -- is the code path reachable?',
          },
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['real', 'autonomous_safe', 'reason'],
  properties: {
    real: { type: 'boolean' },
    autonomous_safe: {
      type: 'boolean',
      description:
        'true only if the fix SKIPS/prevents/captures (never adds a credit/refund/free-path/bypass -- those are owner)',
    },
    money_direction: {
      type: 'string',
      description: 'skip | prevent | capture | add-credit | refund | free-path',
    },
    reason: { type: 'string' },
  },
}

// Hunt: one detector per class, in parallel (barrier so we can hard-cap the
// total number of verifiers below -- keeps the whole run bounded to ~13 agents).
const hunts = await parallel(
  CLASSES.map(
    c => () =>
      agent(c.prompt, {
        label: `hunt:${c.key}`,
        phase: 'Hunt',
        schema: FINDINGS_SCHEMA,
      }).then(r => ({ key: c.key, findings: (r && r.findings) || [] }))
  )
)

const all = hunts
  .filter(Boolean)
  .flatMap(h => h.findings.map(f => ({ ...f, class: h.key })))

// Verify only the most severe candidates, hard-capped, so the run stays bounded.
const order = { critical: 0, major: 1, minor: 2 }
const toVerify = all
  .slice()
  .sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3))
  .slice(0, 6)

log(`Hunt: ${all.length} candidates; verifying the top ${toVerify.length}.`)

const verified = await parallel(
  toVerify.map(
    f => () =>
      agent(
        `Adversarially REFUTE this ${f.class} finding. Default to real=false unless you can PROVE it live by reading the actual code.
File: ${f.file}${f.line ? ':' + f.line : ''}
Claim: ${f.claim}
Scenario: ${f.scenario || '(none given)'}
Reachable (reported): ${f.reachable}
Read the real code around it (run grep/read in cwd). Refute if: the path is dead/unwired/behind a disabled flag; the called fn THROWS on error (so a discarded return is fine); the result IS checked elsewhere; the value is clamped/gated downstream; or the input is impossible. Then set money_direction and autonomous_safe: autonomous_safe is true ONLY if the fix SKIPS/prevents/captures -- a fix that adds a credit/refund/free-path/bypass is OWNER (autonomous_safe=false).`,
        { label: `verify:${f.class}`, phase: 'Verify', schema: VERDICT_SCHEMA }
      ).then(v => ({ ...f, verdict: v }))
  )
)

const confirmed = verified
  .filter(Boolean)
  .filter(f => f.verdict && f.verdict.real)
const autonomousSafe = confirmed.filter(f => f.verdict.autonomous_safe)

log(
  `Confirmed real: ${confirmed.length} (autonomous-safe: ${autonomousSafe.length}, owner: ${confirmed.length - autonomousSafe.length}).`
)

return {
  totalCandidates: all.length,
  verified: toVerify.length,
  confirmed,
  autonomousSafe,
}
