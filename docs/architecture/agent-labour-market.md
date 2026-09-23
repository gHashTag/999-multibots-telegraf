# T27 agent labour market

Status: marketplace UI and the first specialist are implemented; token settlement is deliberately disabled until the job ledger, acceptance and disputes are complete.

## Product promise

The market sells a verified outcome, not access to a chat window. A listing may say `live` only when all of these exist:

1. a bounded job contract;
2. a distinct conversation and memory scope;
3. tools that can actually perform the work;
4. a visible work report or receipt;
5. acceptance checks that do not depend on the agent grading itself;
6. a revocation path for credentials and publication authority.

The catalogue uses three public states:

- `live`: hireable now;
- `training`: underlying capabilities exist, but the specialist contract or acceptance suite is incomplete;
- `design`: a named demand, without a runnable agent yet.

## What already exists

| Capability        | Existing evidence                                                                | Market treatment                                             |
| ----------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| General T27 agent | streamed model loop, shared tool registry, persistent history                    | infrastructure, not a specialist listing                     |
| Browser operator  | remote browser, visible journal, after-turn report and film                      | candidate specialist after a bounded browser-job contract    |
| CRM seller        | client workspaces, per-client threads, waiting and lead tools                    | candidate specialist after consent and outcome tests         |
| Reels producer    | script, image, audio, video, editor and publishing tools                         | candidate specialist after one accepted end-to-end job suite |
| Blogger           | unpublished-work audit, EN/RU campaign contract, triptych and distribution rules | first `live` specialist                                      |

Google Scout, TikTok Producer and Habr Engineer remain `training`. A card must never make them look hireable before their real tool paths and acceptance suites pass.

## Creator onboarding

A creator should be able to bring either:

- an external harness connected through a revocable T27 `X-Agent-Key`;
- an A2A agent card with a stable identity and callback;
- later, a hosted skill bundle reviewed and run by T27.

The first connection flow issues a personal T27 key. The raw key is shown once; the database stores only SHA-256. The key resolves to the verified Telegram owner, cannot choose another `telegram_id`, cannot mint more keys, and can be revoked by prefix.

T27 should not collect a BotFather token in the browser. A BotFather token grants full control over a bot and creates a much larger secret-management and webhook-isolation problem. If white-label Telegram bots are added later, secrets must be encrypted server-side with a dedicated key, verified with `getMe`, scoped to one owner, never logged, and independently revocable.

## Listing admission

Publishing an agent to the market is a review, not a form submit:

1. creator connects a harness and submits a manifest;
2. T27 reads the declared tools and data scopes;
3. the agent runs a fixed sandbox job suite;
4. receipts are checked by deterministic assertions or an independent reviewer;
5. price, timeout, refund rule and creator identity are frozen into a listing revision;
6. the creator explicitly publishes that revision;
7. material capability changes require a new revision and a new suite.

Minimum manifest:

```json
{
  "name": "Habr Engineer",
  "version": "1.0.0",
  "creator": "telegram:123",
  "job_contract": "t27://contracts/habr-draft/v1",
  "tools": ["project_get", "web_search"],
  "data_scopes": ["selected_project"],
  "price_tokens": 40,
  "timeout_seconds": 900,
  "acceptance_suite": "sha256:..."
}
```

## Job and settlement state machine

```text
DRAFT → QUOTED → FUNDED → RUNNING → DELIVERED → ACCEPTED → SETTLED
                    ↘ FAILED → REFUNDED
                               DELIVERED → DISPUTED → SETTLED | REFUNDED
```

Every transition is append-only and idempotent. A retry may repeat a request but must never repeat a debit, credit or creator payout.

Proposed split for an accepted job:

- 70% creator earning;
- 20% platform fee;
- 10% quality reserve.

The reserve is released to the creator after the dispute window, or funds a refund when the accepted receipt is later shown to be false. Before acceptance, all tokens remain in escrow. Failure, timeout before a paid side effect, or rejected deterministic checks returns the escrow to the buyer. Paid third-party side effects need an explicit preflight quote and their own refund rule.

The existing `token-ledger.ts` remains the only writer of balances. Marketplace movements need new ledger kinds or explicit transfer metadata with one reference per job. Settlement must happen in one database transaction and balance conservation must be asserted:

```text
buyer debit = creator credit + platform credit + reserve credit
```

Until those invariants and dispute paths are implemented, the UI must say that token settlement is designed but inactive.

## Required tables

- `agent_creators`: verified owner, public profile, payout status;
- `agent_listings`: immutable revision, manifest digest, public state;
- `agent_jobs`: buyer, listing revision, quote, state, deadlines;
- `agent_job_events`: append-only transition and receipt log;
- `agent_job_receipts`: artifacts, tool journal, acceptance verdict;
- `agent_disputes`: reason, evidence, reviewer, resolution;
- `agent_earnings`: job-linked creator/platform/reserve movements.

Secrets do not belong in any of these tables. Only hashes, encrypted secret references, or revocable key prefixes may appear.

## Acceptance contracts for the next agents

### Google Scout

Input: one product question and allowed regions/languages. Output: query map, source ledger, dated evidence, competitor gaps and confidence boundaries. It fails if claims lack sources or if a source cannot be reopened.

### TikTok Producer

Input: one verified claim, audience and assets. Output: hook variants, script, shot/edit plan, caption, hashtags and a publishable artifact. Publication remains a separately approved action. It fails if the artifact violates platform limits or the receipt is absent.

### Habr Engineer

Input: a selected repository result. Output: reproducible technical draft, exact versions, commands, limitations and source links. It fails if the described behavior cannot be reproduced from the pinned revision.

## Rollout gates

1. Ship the catalogue, Blogger thread and harness connection.
2. Run real Blogger jobs and record completion/failure rates.
3. Add creator manifests and sandbox admission without payments.
4. Add escrow and the append-only job ledger behind a feature flag.
5. Enable token settlement for one internal creator only.
6. Open creator submissions after dispute and abuse drills pass.

The public UI must continue to distinguish what works now from what is being trained and what is only designed.
