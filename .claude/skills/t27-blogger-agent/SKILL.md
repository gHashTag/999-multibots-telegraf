---
name: t27-blogger-agent
description: Find verified T27 work that the public blog has not covered and turn it into a complete EN/RU campaign with a triptych, mandatory hashtags, a contextual service offer, social adaptations, and live receipts. Use for the T27 Blogger specialist and unpublished-work audits; not for generic copywriting.
---

# T27 Blogger Agent

Deliver a verified campaign, not a list of ideas.

## Contract

1. Compare recent merged work and public behavior with the canonical T27 blog.
2. Call a topic unpublished only when a durable receipt exists, the central claim is not already covered, and there is a reader-facing lesson.
3. Combine related changes into one coherent article instead of posting one changelog entry per pull request.
4. Write complete English and Russian versions. Include measurements, boundaries, failures, 3–6 specific hashtags, and one contextual offer for a relevant T27 service.
5. Use the established three-panel engraved img2img system for every article and social cover. Never substitute a generic single illustration.
6. Adapt copy separately for X, LinkedIn and Telegram. Do not post identical text everywhere and do not publish without explicit authorization.
7. Completion requires live article, cover, OG and social receipts. Report missing or failed parts plainly.

## Required result

- evidence and coverage gap;
- EN/RU article;
- triptych and OG assets;
- hashtags and contextual offer;
- platform-specific social drafts or verified post URLs;
- a concise work report with every live receipt.

## Ссылка идёт вторым постом, а не первым (23.09.2026)

**Откуда.** Читатель в X написал владельцу:
он следит за своими числами и видит, что посты с внешней ссылкой получают
меньше охвата. Он публикует тред: первый пост — короткая выжимка с
картинкой, ссылка — следующим постом внутри треда. Сам назвал это возможным
суеверием и попросил проверить.

**Что сделано.** Крон публикаций пишет в X именно так: первый пост —
заголовок и выжимка без единой ссылки (весь лимит 280 достаётся тексту,
а не «ссылка = 23 символа»), ссылка — вторым постом того же треда
(`xThread` в `render/src/agent/blog-share.ts`). Если композер X отвечает не
так, как ожидалось, публикуется старый одиночный пост со ссылкой, и владельцу
в отчёте написано, какой из двух путей сработал.

**Что осталось доказать.** Это гипотеза, а не факт: нужно сравнить охват
тредов и прежних одиночных постов на схожем материале и вернуть читателю
числа — ему обещано «в любом случае». До сравнения не называть это правилом.

**Обещание в ответе.** Владелец отвечает читателю: попробуем, сравним, и
числа вернём независимо от результата. Гипотеза его — результат тоже его.

- **24.09.2026.** Читатель, давший совет про ссылку во втором посте, сам пишет, что публикует мало и это может быть совпадением, и обещает поделиться находками. Значит, наша проверка охвата нужна не только нам: до чисел не называть правилом.

## Why the blog was not reaching the networks (2026-10-02)

**Measured:** `blog_shares` held 11 articles: 1 posted, 10 `declined` — each
closed exactly 30 minutes after the question. The owner never said no.

**Cause:** the desk asks through `requestPermission` (browser approvals), whose
lifetime was a single global `APPROVAL_TTL_MS` = 10 min. The desk believes it
waits `ANSWER_WAIT_MS` = 24 h, but `readApproval` already answered `expired`
at minute 10, and the next tick closed the row as declined — silently. The
Reddit desk had the identical defect.

**Fix:** `browser_approvals.ttl_ms` — each question carries its own lifetime
(null = 10 min for clicks); blog and Reddit desks pass 24 h. An expired
question is now told to the owner; a run where no network took the post is
`failed`, not `posted`. Tick every 5 min (the pace lives in the table): a
30-min timer rarely survives the render's deploy cadence.

**First look next time:** `tri blog-share` — states, minutes-to-close, and
what each network did. Uniform `min_to_close` = a timer, not a person.

Once #3235 is deployed: `tri blog-share reoffer` lists articles the timer closed (declined 20–40 min after asking); `--apply` forgets them and the desk re-asks one a day. Never apply before the deploy — the re-asked question would die at ten minutes again.

**Receipts (2026-10-02).** Every press now says whether the page left the share form (`receiptOf`, `LEFT_THE_FORM`); a confirmed tab is closed, an unconfirmed one stays open as evidence. `blog-share-wiring.ts` is stubbed in tests — a missing import there passes vitest and dies in prod; run `npx tsc --noEmit -p .` in render after touching it.

### Two more lessons (2026-10-02, after #3235)

- **A "declined" is real only if the approval row was decided.** All twelve
  closed rows had `browser_approvals.state = 'pending'` -- nobody pressed no.
  `tri blog-share reoffer` selects by that join (#3279), not by a time window
  (rows closed at 53 and 94 minutes slipped past the 20-40 minute window).
  Stale `pending` approvals past their TTL are cosmetic noise; mark them
  `expired`.
- **One look for the publish button is not a look.** The only allowed article
  reported "button not found" on X and LinkedIn: the cold browser had not drawn
  the composer at six seconds. The desk now looks every 3 s up to ~30 s (#3281);
  the path test with late-drawing composers fails on the old code.

## Threads, Instagram and Facebook go by Meta's API (2026-10-02)

**Measured:** the owner's own browser was signed out of Instagram, Threads and
Facebook (`browser_logins`), so the desk skipped all three on every article.
A browser that is not signed in cannot post, and asking the agent to sign in
there each time is the expensive road.

**Fix:** a connector to Meta's own Graph API, written in t27 first:
`specs/automation/meta-connect.t27` (t27#5523), bound in
`render/src/spec/meta-connect.*`.

- `publishEverywhere` asks `postByApi` first. A network holding a token goes
  by the API, and the browser loop skips it. X, LinkedIn and Reddit still go by
  the browser.
- Two logins cover three networks:
  - The Threads login gets a 60-day token, refreshed by `th_refresh_token`
    once it is a day old and 15 or fewer days remain.
  - The Facebook Login gets a Page token that never ends. That token also
    publishes to the Instagram professional account linked to the Page.
- Instagram needs a public JPEG, and the blog's feed has none. The answer is
  `GET /api/social/card/<slug>.jpg`: a 1080x1350 dark card with the triangle
  point-down and the title. The title is looked up in the feed by slug and
  never taken from the address.
- The receipt is `опубликовано через API · <permalink>`, built from the
  published id (`posted()`). `headlineOf` counts it as a success.

**The owner does this once.** We never create the apps or sign in for him.

1. Create the Meta apps: a Threads use case, plus Facebook Login with the
   Pages and Instagram use cases.
2. Register the callback
   `https://vibee-render-production.up.railway.app/api/social/meta/callback`.
3. Put `THREADS_APP_ID/SECRET` and `META_APP_ID/SECRET` on `vibee-render`.
   Optionally add `META_PAGE_ID` and `META_TOKEN_KEY`.
4. Accept the tester invites in Threads and Instagram.
5. Link the IG professional account to the Page.
6. Profile → «🔗 Threads, Instagram, Facebook через API» → Подключить.

**First look:** `tri meta` lists which apps are set, which tokens are held,
the account and the days left. It never prints values. `tri meta card <slug>`
fetches the card.

## Engage desk: comments under other people's posts (2026-10-02)

Cross-posting the blog is the **blog-share** desk above. The engage desk does
something else. The owner's browser looks for recent posts on his research
topics and drafts one substantive comment per post. **Every comment needs his
own yes, every time.** Nothing is posted without that yes.

- **Where the rules live:**
  - spec: `specs/automation/engage-desk.t27` (vendored in render `src/spec/`);
  - logic: `src/agent/engage-desk.ts`;
  - browser and model wiring: `src/agent/engage-desk-wiring.ts`;
  - tick: `render-server.ts`, every `TICK_MS`. Switched on by
    `ENGAGE_DESK_ENABLED=1`. The search mark lives in `agent_strategies`
    (`engage:last-search`).
- **Read the rows:** `tri engage [N]`.
- **Networks.** The desk searches x, linkedin, reddit, threads and habr, but
  only when `browser_logins` shows the network as `signed_in`.
  - Habr has no known sign-in cookie, so it stays `unknown` and is skipped.
  - Facebook and Telegram have no reader. They are named in the log and never
    guessed at.
  - Searches run in parallel tabs, `PARALLEL_TABS_MAX` at a time.
- **Per-network rule table** (`NETWORK_RULES` plus the spec):

  | Network  | Rule                                                                                                                                                                                                                                   |
  | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | X        | The automation rules forbid automated replies. Each reply is written for one post and sent on a person's yes. No link.                                                                                                                 |
  | LinkedIn | No automated commenting and no engagement pods. No link, no pitch.                                                                                                                                                                     |
  | Reddit   | **9:1**: at most 10% of posted comments over 30 days carry a link to his work. The subreddit's `about/rules.json` is read **before** drafting: a sub that bans AI or bots is skipped, and a sub that bans self-promotion gets no link. |
  | Threads  | Short, no link.                                                                                                                                                                                                                        |
  | Habr     | No advertising in comments, no link.                                                                                                                                                                                                   |

  A draft that breaks its row is dropped, never edited.

- **Context and voice.** The thread's replies are read before drafting. With
  no thread there is no draft. The owner's voice is `VOICE_SAMPLES` of his own
  feed paragraphs, cached weekly in `engage:voice`. Both go into the prompt as
  data.
- **Hard rules from the spec:**
  - 3 proposals per network per day;
  - never twice on one post;
  - no mentions and no DMs;
  - the claim guard (no top rank, no multiplier-freedom credited to the format,
    no FPGA decode advantage);
  - a question lives 24 h (`ttl_ms` on the approval row);
  - a decline is real only when decided, and silence is told to the owner;
  - the receipt is the comment's own words read back on the post page.
- **Lead signals.** A posted comment is looked at between a day and a week
  after it went up. Reddit replies come from the thread JSON. A reply is told
  to the owner, because the conversation is the lead and answering it is his
  job. Other networks show replies as empty, not zero. Followers and DMs
  cannot be attributed to one comment, so they are not counted.

### Lead generation inside the terms of service (what the desk is built on)

1. **Give first, no pitch.** Add a measurement, a trade-off or a question to
   _this_ post. Buyers find people who are useful in public; a pitch in a
   stranger's thread gets removed and lowers the account's reach.
2. **Few, specific, human-approved.** Every network forbids automated or bulk
   engagement: the X automation rules, LinkedIn's ban on automated activity and
   engagement pods, and Reddit's rules against spam and manipulated
   engagement. A small daily cap with a person's yes per comment is what keeps
   this inside the rules.
3. **Links are earned.** Reddit's 9:1 guideline, and no links on X, LinkedIn,
   Threads or Habr comments. The profile and the pinned post do the selling.
   Keep the owner's profile header pointed at t27.ai.
4. **Read the room.** Check the community's rules and the thread first, and
   match its tone. Skip communities that ban AI-assisted text.
5. **Answer the replies.** A reply is the lead. The desk tells the owner, and
   he answers himself. The desk never writes a DM.
6. **Measure honestly.** Count replies per comment. Do not attribute followers
   or DMs to one comment without evidence.
