# The Queen's growth mode ("god mode"): help everyone in the network earn

Owner, 2026-10-02: in god mode the Queen should speed up the benefit for all of
his contacts and the earning of everyone who connects to her. Her job is to help
everyone in the network earn and do better.

## 1. What "god mode" is in the code today

Nothing yet. A search of `apps/`, `src/`, `bin/` and `scripts/` for `god`,
`godMode` and `god_mode` finds no matches. What exists:

- **The Queen at t27.ai** (`hive_queen` in `render/src/agent/hive-tools.ts`)
  judges code in `gHashTag/trios` and keeps the board. Only the keeper can use
  it, and it says nothing about anyone's earnings.
- **The Hive** (`hive_pulse`, `hive_events`): platform events, scoped by
  `visibilityOf` (keeper sees the farm, a bot owner sees their own bots).
- **Per-person money facts:** `crm_revenue` (`crm-revenue-tool.ts`) reads the
  owner's clients' purchases from the live wallet `token_ledger`. The ball
  board (`ball-board.ts`) shows whose move it is per client. Club membership
  (`club-membership.ts`) gives owners and keepers free entry.

So "god mode" is a new capability. This document defines it as **the Queen
acting for each connected person, on that person's own data, with that
person's consent**. It does not mean a keeper who sees everyone's numbers.

## 2. Goal and the one metric

**Goal:** every connected person earns more each month.

**North-star metric:** for each connected person, the stars their own clients
paid in the last 30 days. This is `token_ledger`, `kind = 'purchase'`,
`delta > 0`, one star per token, summed over the person's audience
(`ownerAudience`).

- It is **never** read from `payments_v2`, which is an archive.
- A `grant` is not earnings.
- If the wallet can't be read, the value is **unknown**, never zero.

Secondary metrics:

- share of connected people with at least one payer in the window;
- the median time from connecting to the first paid client;
- follow-up conversion: invoices paid after a follow-up question;
- referral yield: new payers per referral ask the person approved.

Each slice is judged by **lift against a holdout**. Some connected people get
no recommendation for a period. A slice that cannot show lift is not expanded.

## 3. Best practices this design follows (and the sources)

| Practice                                                                                                                                               | What it means here                                                                                         | Source                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next best action: a few competing actions, a "no action" option, guardrails, a holdout, measure lift                                                   | Slice 1 has seven ordered actions plus `unknown`; a holdout comes before expansion                         | [CleverTap](https://clevertap.com/blog/next-best-action/), [Hightouch](https://hightouch.com/blog/next-best-action), [Customer AI Masterclass](https://www.customeraimasterclass.com/blog/what-are-next-best-actions-and-next-best-nudges)                                                                                                                             |
| Explain _why_ an action is recommended                                                                                                                 | Every answer carries the measured facts it was decided from                                                | [MSDW on Dynamics NBA](https://msdynamicsworld.com/blog-post/next-best-action-dynamics-365-myths-facts-and-what-it-actually-does), [Inogic](https://www.inogic.com/blog/2026/03/introducing-next-best-action-ai-powered-recommendations-for-microsoft-dynamics-365/)                                                                                                   |
| Ask for referrals right after a positive moment, not at signup; two-sided rewards; low friction                                                        | A referral ask is only recommended from the third payer, and only after a repeat purchase (slice 2 timing) | [ReferralHero](https://referralhero.com/blog/referral-marketing-best-practices-for-service-businesses), [ReferralCandy](https://www.referralcandy.com/blog/referral-marketing-strategy/), [Buyapowa](https://www.buyapowa.com/blog/referral-program-examples/), [Referral Rock](https://referralrock.com/blog/customer-referral-program-ideas/)                        |
| Double opt-in introductions: ask each side privately before connecting them                                                                            | The matchmaking slice introduces two people only after both say yes                                        | [Fred Wilson, AVC](https://avc.com/2009/11/the-double-optin-introduction/), [TalentGrow](https://www.talentgrow.com/blog/double-opt-in-networking)                                                                                                                                                                                                                     |
| Earnings claims must reflect the typical result; "results may vary" does not cure an atypical claim                                                    | The Queen never forecasts or promises a sum. She shows only what the wallet already measured               | [FTC MLM guidance (Edgeworth summary)](https://www.edgewortheconomics.com/publication-FTC-updated-guidance-MLMs), [FTC earnings-claim NPRM, Jan 2025](https://www.ftc.gov/system/files/ftc_gov/pdf/r111003earningclaimsnprm01132025.pdf), [FTC Endorsement Guides FAQ](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking) |
| Telegram: bots cannot cold-DM; a user account that sends unwanted DMs gets spam-restricted or banned; identical messages are the strongest spam signal | No bulk sends, no identical blasts. Each message is approved by its sender                                 | [Telegram Bots FAQ](https://core.telegram.org/bots/faq), [crmchat on bulk limits](https://crmchat.ai/blog/telegram-bulk-messaging-limits-risks)                                                                                                                                                                                                                        |

**Anti-patterns we refuse:**

- **Spam:** automated outreach to people who did not ask for it.
- **MLM dynamics:** pay for recruiting rather than for a sale; tiers of
  downline commission; "join to earn" framing.
- **Unverifiable earnings claims:** "people like you earn N".
- **Platform bans:** identical mass DMs from a user account.
- **Dark-pattern nudges:** fake urgency, repeated asks to a person who said no.

Revenue share, when it comes, is paid only on a **real purchase** recorded in
`token_ledger`. It is never paid for signing someone up.

## 4. Hard rules (apply to every slice)

1. **Nothing is sent on anyone's behalf without that person's explicit yes,
   per message.** This applies to the owner and to every user. Use the
   existing approval path (`propose()` / the per-question approval TTL,
   `tri blog-share` lineage). A batch approval does not count.
2. **No promised earnings.** Show only measured history from the person's own
   wallet. No forecasts.
3. **Consent to be matched or introduced is per person and revocable.** The
   default is off. An introduction is double opt-in: both sides say yes before
   either learns the other's details.
4. **Privacy:** one person's data is never shown to another without consent.
   A recommendation reads only the caller's own data. Slice 1 has no keeper
   override.
5. **Money is read from `token_ledger` and `user_tokens`.** Never read
   `payments_v2`. Never write to it.
6. **Unknown is said out loud.** An unreadable source returns `unknown`, never
   a zero that triggers advice.

## 5. Slices, in order

### Slice 1: next best action to earn (read-only). DONE in this PR.

- **Spec:** `gHashTag/t27 specs/automation/queen-growth.t27`, vendored at
  `render/src/spec/queen-growth.{t27,gen.ts}`.
- **Host:** `render/src/agent/queen-growth.ts`, tool `hive_growth` in `TOOLS`
  next to the hive tools. It is available in the agent chat in the bot, the
  Mini App and iOS, and over `/mcp`.
- **CLI:** `tri growth` (owner).

The actions are weighed in this order; the first that applies wins:

1. unknown
2. connect bot
3. first contacts
4. follow up open invoice
5. first offer
6. win back
7. next offer
8. ask referral (from 3 payers)

The tool sends nothing and promises nothing.

### Slice 2: draft, never send

For the chosen action, the Queen prepares a draft through the existing tools:
a `crm_offer` invoice draft, a follow-up question, or a story-reel gift. The
draft goes into the person's approval queue, and they approve each message.

The slice adds three things:

- timing rules: a referral ask follows a repeat purchase, at most one ask per
  client per 30 days, and none after a "no";
- a 10% holdout;
- an outcome record of action, approved, sent, and paid within 14 days.

### Slice 3: consent ledger and double opt-in matchmaking

This slice adds a `growth_consent` table (person, scope `match` | `intro` |
`share_metrics`, granted_at, revoked_at), plus a "who can help whom" matcher
over consented profiles only. A matching rule is, for example, a seller of X
paired with a buyer who asked about X.

Introductions follow the double opt-in pattern: each side gets a private
yes/no, and only after both say yes do they get the intro.

### Slice 4: Queen's weekly plan and fair revenue share

Each consenting person gets a weekly plan of the top three actions, with last
week's measured result, in the Hive tab. A referral share is paid in tokens
only on a referred person's real purchase. It has one level only, no downline,
and is booked in `token_ledger` with a `ref`.

The keeper's network view shows aggregates only (counts and medians), plus
per-person rows for people who granted `share_metrics`.

## 6. Open questions for the owner

- Should the holdout share be 10%, or is the network too small for that?
  At small n, the lift needs weeks to read.
- Should the referral share be a fixed token amount, or a percentage of the
  first purchase?
