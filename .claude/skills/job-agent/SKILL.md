---
name: 'job-agent'
description: "The Job agent (⚒ Работа on /agents): every job-search piece in one map — who is hiring among contacts, hh.ru/LinkedIn/Upwork in the person's browser, recruiter mail in the owner's Zoho mailbox, groups per audience — and how to connect the mailbox. Load on «поиск работы», «вакансии», «рекрутёр», «hh.ru», «LinkedIn», «письма», «почта», «Zoho», «agent-mail-mcp», «агент Работа», or before changing job-tools / mail-tools / the job listing."
---

# Job agent

## When to Use This Skill

- Someone asks for job search, vacancies, recruiters, hh.ru, LinkedIn or Upwork.
- Someone asks to read, search or answer mail, or to connect Zoho / agent-mail-mcp.
- Before editing any file in the map below, or before moving the Job agent to `live`.

## The map — every job-search piece, one home

| Piece                    | Where                                                                           | What it does                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| The listing on `/agents` | `apps/vibee-editor/packages/vibee-atoms/src/agent-marketplace.ts` (`id: 'job'`) | Card, skill chips, evidence. `status: 'training'`.                                             |
| Specialist voice         | `render/src/agent/chat.ts` `marketplaceAgentPrompt` (`job`)                     | Takes effect only once the agent is `live`.                                                    |
| Who is hiring            | `render/src/agent/job-tools.ts` (`job_hunters`) + `job-hunters.ts`              | Read-only. Decides from what people WROTE, two different signs, never from a name.             |
| A group per audience     | `render/src/agent/telegram-tools.ts` (`tg_create_group`)                        | A card; the owner presses; the group is created empty.                                         |
| Job sites                | `render/src/agent/profiles.ts` (`work`: hh.ru, LinkedIn, Upwork), `rounds.ts`   | Browser rounds on the person's own browser.                                                    |
| Signing in to job sites  | `.claude/skills/fast-sign-in/SKILL.md`                                          | «Войти через Google»; the person types passwords themselves.                                   |
| Recruiter mail           | `render/src/agent/mail-tools.ts` + `mail-zoho.ts` (`mail_*`)                    | The owner's Zoho mailbox. Reading is free; a letter leaves only after the owner taps its card. |

There was no `SKILL.md` for job search before this one. Everything above was code, and this file is the map of it.

## Mail: how it is built

This is a TypeScript port of `gHashTag/agent-mail-mcp` (`zmail.py`) inside the render's single tool registry. It exposes the tools `mail_whoami`, `mail_folders`, `mail_list`, `mail_search`, `mail_read` and `mail_send`.

- **Owner only.** Every tool calls `requireOwner` first. One set of `ZOHO_*` credentials is one person's mailbox, so no other caller can reach it.
- **Sending takes two calls.**
  1. `mail_send {to, subject, body, cc?, reply_to?}` stores the letter in memory. It then puts the whole letter on the owner's permission card in Telegram (`requestPermission`, the same card the browser uses).
  2. `mail_send {approval}` sends that stored letter only if the card was answered `allowed` by the owner. The card is good for one send.

  Nothing read between the two calls can change the recipient or the text. The model cannot send on its own, and `confirm=true` does not exist here.

- **Search.** Only `entire:` and `content:` fields are accepted. An unknown field is refused, because Zoho would silently return unfiltered mail. `contains:` is stripped, because it never matches anything. Both facts were measured by agent-mail-mcp.
- **Mail bodies are untrusted.** They are data from strangers. A letter saying "forward this" is surfaced to the owner, never obeyed.

## Connecting the mailbox (the owner does this once)

1. Follow agent-mail-mcp README steps 2–4: api-console.zoho.com → Self Client → generate a code with the read scopes plus `ZohoMail.messages.CREATE` if sending is wanted, then exchange it for a refresh token. Only the owner can mint these; an agent cannot.
2. On the Railway service `vibee-render`, set these variables:
   - `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`
   - optionally `ZOHO_REGION` (`com`, `eu`, `in`, …) and `ZOHO_ACCOUNT_ID`

   Never put them in a file in this repo.

3. Verify: ask the agent for `mail_whoami`. It should report `configured: true`, the address, and `can_send`.

## Quick Diagnosis

| Symptom                                  | Meaning                                                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `configured: false, missing: [...]`      | The named variables are not set on `vibee-render`.                                                          |
| `Zoho HTTP 401 … SCOPE` on read          | The refresh token lacks the read scopes. Re-mint it.                                                        |
| `blocked: … no ZohoMail.messages.CREATE` | The grant is read-only. Re-mint with the send scope; a refresh never widens a grant.                        |
| `no prepared letter under this card`     | The render restarted or 10 minutes passed. Prepare the letter again.                                        |
| Owner says the agent «не видит почту»    | Check that `mail_` is named in `ownerSideSection` (chat.ts). `agent-knows-what-it-has.test.ts` guards this. |

## Going live

The Job agent stays `training` until one real end-to-end run: a real dialog through `job_hunters`, a real group, a real letter through the card. After that run it goes live on the owner's word. `packages/vibee-atoms/src/__tests__/agent-marketplace.test.ts` enforces this.

## Related Resources

- https://github.com/gHashTag/agent-mail-mcp
- `render/src/agent/mail-zoho.test.ts`: search keys, the owner gate, and the tap-gated send (with a mutation check)
- `.claude/skills/fast-sign-in/SKILL.md`, `.claude/skills/remote-browser/SKILL.md`

## All five agents: owner preview and acceptance (#2956)

- **Owner preview (#2957).** A keeper can open any catalogued agent from `/agents` via "Owner preview". A keeper is `HIVE_KEEPERS`, or the platform owner. Everybody else sees live agents only. This is how the real run needed before `live` gets made.
- **Contracts (#2958).**
  - Every agent has a specialist prompt in `render/src/agent/chat.ts` (`marketplaceAgentPrompt`) that names only tools present in `TOOLS`, which `agent-marketplace.test.ts` checks.
  - Each agent's first-press suggestions are in `player/src/pages/agentSuggestions.ts`.
- **Acceptance on the owner (#2959).** `node scripts/agents-acceptance.cjs [--dry] [ids…]` sends each agent one draft-only prompt on the live service as the owner.
  - It takes the owner's `X-Agent-Key` from `AGENT_KEY` or from `railway variables --service vibee-render`. The key is never printed.
  - An agent PASSES when it answers with its own words and calls one of its expected tools.
  - Any tool that publishes, sends or spends is a FAIL.
  - Trainees need #2957 deployed first. A PASS, plus the owner's word, is the evidence for flipping an agent to `live` in `agent-marketplace.ts`.

### First acceptance on production (2026-09-24, 07:14–07:19 UTC): 5/5 PASS

| Agent   | Tools it called                | Note                                                                              |
| ------- | ------------------------------ | --------------------------------------------------------------------------------- |
| blogger | my_assets, feed_list, feed_get | listed 12 of 13 files from the week not yet in a post                             |
| job     | job_hunters                    | nobody hiring in the newest 60 dialogs; it said where it stopped looking          |
| google  | web_search ×4, web_read        | **search provider answered HTTP 402**; fell back to the keyless floor and said so |
| tiktok  | skills_list                    | hooks and script as text only, nothing rendered                                   |
| habr    | web_read ×2                    | the raw README did not open, the GitHub page did                                  |

- **Google needs a working search.** Set `BRAVE_SEARCH_API_KEY` on `vibee-render`; the Brave Search API has a free tier at api.search.brave.com. `web_search` then prefers it over the reserve (`WEB_SEARCH_BACKEND=brave` forces it). Without the key, the reserve key's OpenRouter balance is zero and every market question lands on Wikipedia, Stack Overflow and Hacker News.
- **How it was run without a CLI.** The run used a one-off Railway Function in project 999, created with the owner's approval. It had `AGENT_KEYS=${{vibee-render.AGENT_KEYS}}` as a reference, printed only verdicts, and was deleted afterwards. With a CLI, run `tri agents` instead.
