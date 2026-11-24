# TurboBaby as a world profile on the shared core

Status: design, 2026-10-11. Tracked by epic #3937 (private; do not copy the
findings to public repos). Nothing here is deployed.

**TurboBaby is not moved by code. It becomes a world profile over the shared
core, and its rules stay `.t27` specs that both hosts execute: the Rust Mini App
and our TS.**

## Layers

| Layer | What it holds | Where it comes from |
| --- | --- | --- |
| Core (reused) | agent runtime and tool registry; team `bot-agent-team`; CRM office `bot-office-crm`; spec bank `agent-spec-bank`; provider chain (free z.ai); media on Kie | this repo |
| World contracts (imported, not copied) | `specs/turbobaby/`: availability, pricing_honesty, rental_terms, deposit_tiers, market_profile, bike_catalog, ride_game, plus the agent card | `gHashTag/turbobaby-user-bot` |
| World profile (new, thin) | world id, which core capabilities are on, market reference, price authority, forbidden fields, data scope | one spec, `world-profile.t27` |

## What the core gains (useful to every bot, not only this one)

1. **Owner isolation as a core law.** `crm-sellers.t27` already states
   `DATA_SCOPED_BY_CALLER = true`; `crm-client-setup-tool.ts` still carries
   `OR owner_id IS NULL`. Fixing it (epic F02) makes the law true for every
   seller.
2. **The price door as a general rule.** "No number without a source; silence
   is an answer" (TurboBaby D11). Reconcile with `agent-claims-honest.t27`
   instead of writing it twice.
3. **The profile decides what the agent leads with.** Same mechanism as a
   team member's trade in `profession.ts`; every tool stays visible.

## What stays with TurboBaby

Its Rust Mini App, its database and its rental checkout. Contact with the core
is only at the boundaries: shared `.t27` contracts, read-only CRM, the agent as
its owner agent in our team.

## Order

1. Gate: epic F01, F02, F07 closed. No real data, no sends: synthetic only.
2. `world-profile.t27` in `gHashTag/t27`, copy + `gen-ts` + binding test here.
3. Isolation law: drop `OR owner_id IS NULL`, two-owner synthetic test.
4. TurboBaby contracts into the spec bank (`t27_specs`).
5. Agent card in the hive catalogue, on a test bot.
6. Sandbox: availability and price strictly by contract; the sheet silent
   means no number.

## Not yet verified

- Does `t27c` emit code a Rust host can use, or does Rust read the spec
  another way (decides whether both sides run one file).
- How the hive loads catalogue agents and whether a world needs no code edit.
- Whether `agent-claims-honest.t27` already covers "silence is an answer".
