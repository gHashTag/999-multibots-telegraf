# Agent browser: competitors and the decomposed plan (2026-10-02)

Our shape: one real browser per person on the server, agent and person drive
the same window, place-based guard, passwords only by the person.

## What the others do that we do not

| Product                 | Idea worth taking                                                                   | Our gap                                                               |
| ----------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| browser-use             | DOM indexed into numbered elements; the model acts by index, not by pixel           | we click by label probe (`findProbe`); a renamed button = "not found" |
| BrowserOS               | saved per-site skills ("how to post on X") replayed as scripts, audit log per agent | each run rediscovers the composer                                     |
| OpenAI Operator / Agent | hands control back on login/captcha, then resumes the same task                     | `browser_ask_input` exists; captcha has no hand-back path             |
| Buffer / Typefully      | posts through the network API, gets the post URL back as the receipt                | we get no URL; receipt is "page left the form" (#3235)                |
| Browserbase / Steel     | session recording + replay for every run                                            | a failed post leaves no trace but one string                          |

## Plan (each step one PR, smallest first)

1. **Receipt by profile** — after a post, open the own profile/feed and look
   for the article link; unconfirmed → `failed`. (extends `receiptOf`)
2. **Screenshot on failure** — store one screenshot per network when the
   receipt is not confirmed; link it in the owner's message.
3. **Per-site recipes** — the X thread / LinkedIn / Reddit / Threads steps as
   data (labels, URL, receipt rule) in one table, not code branches.
4. **Captcha hand-back** — on a detected challenge, `browser_ask_permission`
   with "solve it in the Browser tab", then resume.
5. **Re-offer expired articles** — one question listing the closed-unanswered
   slugs (`tri blog-share` shows them).
6. **Indexed DOM targets** — fall back from label probe to numbered
   interactive elements for the model (browser-use style).

Out of scope on purpose: network APIs instead of the browser — the owner's
rule is that the agent uses the person's own signed-in browser.
