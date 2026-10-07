# Card -> agent conversation: how leading products do it (2025-2026)

Research date: 2026-10-01. Method: web search and page fetches, read-only; no
sign-in, nothing posted. Every claim below is tagged with how it was checked:

- **[verified]** - read on the vendor's own docs, changelog or spec page.
- **[secondary]** - only seen in third-party write-ups or search summaries.
- **[unverified]** - plausible, could not be confirmed; do not build on it
  without checking.

Question: when a person taps a task/issue card on a board, where does the
conversation with the agent working on it open, what does its history show,
how does the person continue or steer, what does the card itself say about the
agent, and how does it behave on a phone?

---

## 1. Summary table

| Product                       | Where the chat opens                                             | History shows                                                                                      | Continue / steer                                                                                | Card / list signal                                                                 | Mobile                                                                             |
| ----------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Linear (Agents, Linear Agent) | Agent session inside the issue, in an "agent panel"              | Typed activities: thought, action, elicitation, response, error; plus a plan checklist             | Reply in the session thread; Stop; line-comments on diffs feed the next message                 | Session state: pending / active / awaitingInput / error / complete / stale         | Native app: open session, realtime reasoning, send steering messages, review diffs |
| GitHub Copilot cloud agent    | Agents panel (header popover) and Agents page/tab -> session log | Step log: reasoning + tools; overview; files changed                                               | Prompt box under the log (applied after current tool call); `@copilot` in PR comments; Stop     | queued / running / awaiting feedback / completed / failed; eyes reaction on issue  | Copilot tab: session list filtered by state, native session logs, stop, create PR  |
| OpenAI Codex (cloud)          | Task list -> task detail page                                    | Summary, logs, diff                                                                                | Follow-up turn in the same task (queued by default); "Push / Create PR"                         | Task list with states; archive tab                                                 | ChatGPT iOS/Android: Codex tab with tasks and threads, approvals, steering         |
| Devin                         | Session page: chat left, workspace right (collapsible)           | Chat + workspace timeline (shell, browser, editor, planner) scrubbable; Task / Plan / PR / Summary | Message in session (web, Slack thread, or Linear agent session); sleep / wake                   | Session manager filters; sleeping sessions                                         | No native app found; Slack is the phone surface                                    |
| Cursor Cloud Agents           | cursor.com/agents (web, PWA) and native iOS app                  | Live chat stream, subagent transcripts, diffs, screenshots, videos, logs                           | Follow-up messages to a running agent; voice input; slash commands                              | Push: finished / needs input / ready for review; Live Activities on lock screen    | Native iOS (beta, 2026-06-29); Android via PWA                                     |
| Google Jules                  | Task view: activity feed + chat + diff                           | Plan (expandable steps), activity feed, mini diffs                                                 | Chat box any time; "approve plan"; pause; PR comments                                           | Working / awaiting feedback / paused                                               | Web only; browser notifications; no official native app found                      |
| Factory (Droids)              | Web/mobile session view; also inside Linear/Jira                 | Chat history, tool calls, terminal output, diff                                                    | Unblock, leave feedback, approve diffs; take over via shared link                               | Sessions grouped/filtered across surfaces                                          | Web + mobile tuned for small screens; shareable live session URL                   |
| Plane                         | Agent run threaded into work-item comments                       | Prompt, response, elicitation visible; thought/action ephemeral                                    | Reply to the agent's comment continues the same run                                             | created / in_progress / awaiting / completed / stopping / stopped / failed / stale | Not researched in detail [unverified]                                              |
| Asana AI Teammates            | Task comments (plus Asana Dash / smart chat)                     | Plan comment, subtasks, status comments                                                            | Comment / @mention / reassign; redirect at checkpoints                                          | "Like" on the task as acknowledgement [secondary]                                  | Not researched in detail                                                           |
| A2A protocol                  | n/a (wire protocol)                                              | `Task.history` (messages) + `artifacts`                                                            | Same `taskId` while interrupted; same `contextId` + new task after terminal; `referenceTaskIds` | TaskState enum incl. INPUT_REQUIRED, AUTH_REQUIRED                                 | n/a; reconnect via SubscribeToTask                                                 |

Height (Height Copilot) shut down on 2025-09-24 and is excluded [secondary].

---

## 2. Product by product

### 2.1 Linear - Agents, agent sessions, Linear Agent

**Model.** An `AgentSession` is created automatically when an agent is
@mentioned or an issue is delegated to it [verified]. Delegation is not
assignment: "Assigning an issue to an agent delegates the issue to that agent
while the human teammate remains the primary assignee and owner" [verified].
Agents are "app users" that can be mentioned, delegated issues, comment and
collaborate [verified].

**Where it opens.** Inside the issue, in what the changelog calls the "agent
panel" (fixes such as "agent panel so it closes on Esc when the input is
empty", "agent chat incorrectly minimizing on external link click", "agent
thoughts now take up the full available height of the panel when active")
[verified, changelog]. The exact geometry (right-side panel vs inline) is
[unverified]; the changelog wording implies an expandable/minimisable panel
attached to the issue. Sessions can carry `externalUrls`, rendered as an "Open"
link to the vendor's own dashboard (Devin, Cursor, etc.) [verified].

**What the history shows.** Five semantic activity types: `thought`,
`elicitation`, `action` (tool call with optional result), `response`, `error`
[verified]. Thoughts and actions may be **ephemeral** - replaced by the next
activity - so the transcript does not drown in tool chatter [verified]. A
session-level **plan** is a checklist whose items are `pending`, `inProgress`,
`completed`, `canceled`; agents replace the whole plan on each update
[verified]. Linear's guidance: rebuild conversation from activities, not from
comments, because comments are editable; activities are frozen snapshots
[verified].

**Session state.** `pending`, `active`, `error`, `awaitingInput`, `complete`,
`stale`, derived by Linear from the last emitted activity [verified]. An
agent must acknowledge with a `thought` within 10 seconds of creation or it
looks unresponsive; a session goes stale after 30 minutes without activity
[verified]. An elicitation shows a status badge on the comment that is removed
when new activity arrives [verified, changelog 2025-09-19].

**Continue / steer.** Reply in the session thread; the user can **Stop**,
which arrives at the agent as a `stop` signal on a prompt rather than as a
separate event [secondary]. Elicitations can carry a `select` signal that
renders option buttons and an auth signal that renders a sign-in link
[secondary; exact signal names `auth`/`select`/`stop`/`continue` are
unverified on Linear's own page]. On delegation the agent should move the issue
into the team's first "started" status [verified] - i.e. the card moves column
because of the agent.

**Status on the board.** "My issues -> Assigned" on mobile "shows the status of
each coding session, and gives you a quick way back into active work"
[verified]. Custom views and Insights can be filtered by "Delegate" [verified].

**Mobile.** 2026-03-12: "open its session in the Linear mobile app to see
realtime reasoning or review past sessions", and send messages to steer
[verified]. 2026-07-30: review code changes, "tap the relevant line to add it
to your message to steer the coding session", start new sessions from any PR
via the Agent panel [verified].

**Multi-agent.** Several vendors (Devin, Cursor, Factory, Copilot, Codex)
appear as delegates in the same workspace; one delegate per issue at a time,
changeable via "No agent" [verified]. Whether two agents can hold concurrent
sessions on one issue is [unverified]. Devin syncs its todo list into Linear's
plan UI and posts commands run, files edited and progress summaries into the
session [verified].

### 2.2 GitHub Copilot cloud agent (formerly "coding agent")

**Entry.** Assign an issue to Copilot (it reacts with an eyes emoji and opens a
draft PR), start from the **Agents panel** in the GitHub header, the
repository **Agents tab**, VS Code, CLI or Mobile [verified].

**Where it opens.** Clicking a session opens the **session log and overview**
(progress, token usage, session length) with a **Files changed** view
[verified]. Mission control (Agent HQ, 2025-10-28) puts assignment, real-time
logs, steering and the resulting PR on one page [verified].

**History.** "Session logs show Copilot's internal reasoning and the tools it
used to understand your repository, make changes, and validate its work"
[verified]. Each commit links back to its session log [verified].

**Steer.** A prompt box **below the session log**; "Copilot implements your
input after it finishes its current tool call" [verified]. Steering can also be
an inline comment in Files changed [verified]. Each steering message consumes
credits; steering is not available for third-party agents [verified]. Outside
the session, `@copilot` in any PR comment starts a new session that remembers
previous sessions on that PR [verified]. Hand-off buttons: "Open in VS Code",
"Continue in GitHub Copilot CLI" [verified].

**Status.** queued / running / awaiting feedback / completed / failed
[secondary]. Eyes reaction + "Copilot has started work" timeline event as
the acknowledgement signal [verified].

**Mobile.** Copilot tab (Android nav bar): session list with state filters
and real-time updates, native session logs, create PR from a finished session,
**stop** a running session [verified, changelog 2026-04-01]. Model picker on
mobile [verified]. Research/plan-before-code and branch-without-PR on mobile
[verified, changelog 2026-04-08].

**Multi-agent.** The Agents tab runs Copilot alongside Anthropic Claude and
OpenAI Codex agents; custom agents selectable per task [verified].

### 2.3 OpenAI Codex (cloud)

**Pattern.** Task list -> task detail with summary, logs and diff; "request
follow-up changes"; "commit or open a pull request when you're ready"
[verified, learn.chatgpt.com/docs/cloud]. Best-of-N parallel attempts are
mentioned [verified, wording only]. Follow-ups queue by default since app
26.208 [secondary, changelog via search]. A follow-up can update an existing PR
[secondary]. Archive tab via `?tab=archived` [secondary].

**Mobile.** Codex has been in the ChatGPT iOS app since 2025; on 2026-05-14 a
full Codex experience shipped in the ChatGPT iOS/Android app to monitor, steer
and approve tasks across devices; tasks and threads appear as a list under a
Codex tab [secondary - OpenAI's own pages returned 403 to the fetcher]. Cloud
tasks keep running if the phone loses signal; state updates on reconnect
[secondary, help center via search]. Reusable cloud environments (2026-09-29)
let a task be reopened later from phone or browser without losing unsent
changes [secondary].

**Note.** Known failure mode reported publicly: a task stays "active" with no
visible progress and no response to a follow-up [secondary, GitHub issue] -
i.e. "running" without a liveness signal is a lie the UI can tell.

### 2.4 Devin (Cognition)

**Per ticket.** A Jira/Linear ticket starts a session by assignment, label
(playbook labels such as `!plan`, `!implement`) or @mention; Devin posts a
direct link to the web session on the ticket [verified]. Optional
"scoping only" mode posts a plan + confidence comment instead of working
[verified].

**Where it opens.** Web session: chat on the left, Devin's Workspace (shell,
browser, editor, planner) on the right; either side collapsible to full screen
[secondary, older reviews]. A 2025 redesign highlights "the Task, the Plan, the
PR, and the Summary" [secondary, release notes via search]. History is
scrubbable: moving the workspace timeline scrolls the chat to the matching
messages [secondary].

**Continue.** Message in the session, Slack thread, or Linear agent session.
Sessions **sleep** instead of ending; any message wakes them; PR comments or
failing lint wake them automatically; typing in the composer starts waking
the session before send; asleep sessions show the last screenshot with a
"Wake up Devin" action [secondary, release notes via search].

**Mobile.** No native app found; Slack is the phone surface [secondary].

### 2.5 Cursor Cloud Agents (formerly background agents)

**Where.** cursor.com/agents on any device, installable as a PWA; native iOS
app in public beta since 2026-06-29 [verified]. Started also via `@cursor` in
GitHub, Slack, Linear [verified].

**History.** Shared agents show "the conversation, the code changes, and the
artifacts", including screenshots, videos and logs [verified]. Tap a subagent
card to read its child transcript [secondary].

**Continue.** Follow-ups to a running agent, voice input, slash commands;
remote-control an agent running on your own computer [verified]. Team
follow-ups on someone else's agent must be enabled by an admin; default is
read-only [verified].

**Status signals.** Push notifications when an agent "finishes, needs input,
or is ready for review"; Live Activities on the lock screen [verified]; up to
eight agents tracked at once [secondary].

### 2.6 Google Jules

**Where.** Task view with activity feed, inline explanations, mini diff per
file, full diff editor, and a chat box [verified].

**Plan gate.** Jules presents a plan (description, steps, assumptions) with
expandable steps and an **approve plan** button; if you navigate away the plan
auto-approves on a timer ("no need to babysit") [verified]. API sessions can
require explicit approval (`requirePlanApproval`) [verified].

**Steer.** Chat at any time; Jules may replan. Pause button [verified]. API:
`sendMessage` returns empty, the reply arrives as the next activity - the
conversation is an activity stream, not request/response [verified].

**Status.** Working / awaiting feedback / paused [verified]. Notifications are
browser notifications "when the task completes or needs your input"
[secondary]. No official native mobile app found; third-party clients exist
[secondary].

### 2.7 Factory (Droids)

Delegate from Linear/Jira by @mention or assignment; triage rules can launch
agents automatically [verified]. Web + mobile: "watch progress, inspect tool
calls, and unblock Droids", diff viewer, terminal output and chat history
"tuned for small screens" [verified]. **Shareable live session URL**: a
teammate can watch, comment or take over without installing anything
[verified]. Sessions sync across desktop, web, CLI and IDE [verified].

### 2.8 Plane, Asana, Height

- **Plane**: agents are assignees and @mention targets; each interaction is an
  **Agent Run** with states created / in_progress / awaiting / completed /
  stopping / stopped / failed / stale (5 min without updates) [verified].
  Activities: prompt, thought (ephemeral, invisible), action (ephemeral),
  response and elicitation (both create visible comments), error [verified].
  Signals: continue, stop, auth_request, select [secondary]. Replying to the
  agent's comment continues the same run with full history [verified].
  Plane AI chat shows planned changes as **action cards** that do nothing
  until confirmed [secondary].
- **Asana AI Teammates** (GA 2026-03): triggered by assignment, @mention, or
  updates on objects they collaborate on; they work through comments and
  subtasks so people "review or redirect at any checkpoint"; explicitly
  asynchronous, "not real-time chat" [secondary]; a redesigned Teammate chat
  was announced around 2026-06 with no documented placement [unverified].
- **Height**: shut down 2025-09-24 [secondary].

### 2.9 A2A protocol (agent-sync standard)

Spec v1.0.0 released 2026-03-12 [secondary, GitHub release via search];
current page at a2a-protocol.org/latest/specification [verified].

- **Task** = unit of work: `id`, `contextId`, `status` (state + message),
  `history` (messages), `artifacts`, `metadata` [verified].
- **States**: `TASK_STATE_SUBMITTED`, `WORKING`, `INPUT_REQUIRED`,
  `AUTH_REQUIRED` (interrupted), `COMPLETED`, `FAILED`, `CANCELED`,
  `REJECTED` (terminal) [verified].
- **contextId** "logically groups multiple Task objects and Message objects
  that are part of the same conversational context" [verified].
- **Continuing**: while a task is interrupted (`INPUT_REQUIRED`), send a message
  with the same `taskId` + `contextId` [verified]. Terminal tasks reject new
  messages (`UnsupportedOperationError`) [verified]; a follow-up after
  completion is a **new task in the same contextId**, optionally citing the old
  one via `referenceTaskIds` [verified field; usage pattern secondary, e.g.
  LangChain Agent Server].
- **History size**: `historyLength` (unset = all, 0 = none, n = cap) on
  GetTask, ListTasks, SendMessage [verified].
- **ListTasks** filters: `contextId`, `status`, `pageSize` (1-100),
  `statusTimestampAfter`, `historyLength` [verified] - exactly what a board
  needs to compute "changed since I last looked".
- **Updates**: polling, streaming (`TaskStatusUpdateEvent`,
  `TaskArtifactUpdateEvent`), push notifications to webhooks [verified].
  `SubscribeToTask` must emit the current `Task` as its first event, so a
  reconnecting client cannot miss state between fetch and subscribe [verified].

**Mapping to a board.** card = `contextId`; each run/turn = a `taskId` inside
it; card badge = state of the newest task; chat history = concatenated
`history` of the context's tasks in time order; "unread" = tasks/messages with
`statusTimestamp` after the person's last-seen cursor.

---

## 3. Cross-cutting patterns

1. **The card owns one conversation; runs live inside it.** Linear (session per
   delegation, several sessions per issue over time), Copilot (sessions per
   PR, memory across them), A2A (`contextId` over many `taskId`s). Nobody makes
   the person pick a session before they can talk.
2. **History is layered, not flat.** Messages (human + agent response /
   question) are first-class; tool steps are collapsed or ephemeral (Linear
   ephemeral activities, Plane invisible thoughts/actions, Copilot log as a
   separate view); the **plan** is a pinned checklist (Linear plan, Devin todo,
   Jules plan).
3. **"Needs you" is a distinct state, not a flavour of running.** Linear
   `awaitingInput`, Copilot "awaiting feedback", Jules "awaiting feedback",
   Plane `awaiting`, A2A `INPUT_REQUIRED` / `AUTH_REQUIRED`, Cursor push "needs
   input". It is the one state every product pushes a notification for.
4. **Steering is queued, not interrupting.** Copilot applies input after the
   current tool call; Codex queues follow-ups by default; Jules may replan.
   The UI should say so ("will apply after current step").
5. **Structured asks beat free text.** Linear/Plane `select` option buttons,
   Jules "approve plan", Plane action cards, Copilot/Cursor approvals. Free
   text is the fallback.
6. **Stop is always one tap away** (Linear Stop signal, Copilot mobile stop,
   Jules pause, Devin sleep).
7. **Acknowledge fast, prove liveness.** Linear demands a thought within 10 s
   and marks sessions stale after 30 min; Plane after 5 min; Copilot reacts
   with eyes. Codex's public "active but silent" bug shows the cost of not
   doing this.
8. **Phones are for triage, steering and approval, not authoring.** Every
   mobile surface (Linear, GitHub, Codex, Cursor, Factory) emphasises: list by
   state, read the log, answer the question, approve/stop, review a diff.
9. **Shareable, addressable sessions.** Factory live session URLs, Linear
   `externalUrls`, Devin links on tickets, Copilot commit -> log links, Codex
   query parameters.
10. **Wake-on-type.** Devin starts waking a sleeping session as soon as the
    person types; the composer itself is a liveness signal.

---

## 4. Ten prioritised UX recommendations

Target: Telegram Mini App, ~390 px wide, the board rendered inside an iframe;
tapping a card opens a chat with the agent and its history. Priority 1 is
highest.

### R1. One sheet, three detents, owned by the parent frame (P1)

- Open the chat as a **bottom sheet**, not a route push, so the board stays
  visible for orientation. Detents: **peek** (~30%: header + status + last
  agent message + quick actions), **half** (~55%: recent history + composer),
  **full** (100% of `viewportStableHeight`, history + composer). Default to
  **half**, or **full** when the card state is needs-you (the person came to
  answer).
- Include a visible grabber (HIG) and make it a 44 px tall drag target.
- Telegram conflict: the Mini App itself closes/minimises on vertical swipe.
  Call `disableVerticalSwipes()` while the sheet is open and re-enable on
  close; bind Telegram **BackButton** to "collapse one detent, then close".
- Iframe: let the **outer document** render the sheet (or at least size it)
  via `postMessage`, because only the outer frame reliably sees
  `viewportChanged`, `safeAreaInset`, `contentSafeAreaInset` and the keyboard.
  The iframe sends `{open: cardId}`; the parent replies with the stable height.
- Use `viewportStableHeight`, not `viewportHeight`, for layout; the latter
  changes during gestures.

### R2. Composer pinned to the bottom, keyboard-aware, wake-on-type (P1)

- Composer sticks to the sheet bottom above `safeAreaInset.bottom`; when the
  keyboard opens, jump the sheet to **full** and keep the last message visible
  (scroll anchor on the newest item).
- Single-line input growing to 4 lines, send button inside the field (44x44),
  attachment/voice to the left. Do **not** put "send" on Telegram MainButton:
  it sits outside the iframe, below the keyboard on some clients, and
  separates the action from the text.
- Use MainButton/BottomButton only for the **one structured decision** when the
  agent is blocked (e.g. "Approve plan", "Continue"), mirroring Jules.
- On first keystroke, emit a "user is typing" ping to the backend (Devin
  wake-on-type) so a sleeping agent is warm by the time the message lands.
- When the agent is mid-step, show under the field: "Will apply after the
  current step" (Copilot semantics), and queue the message visibly.

### R3. "Needs you" as its own state with its own badge, everywhere (P1)

- Card badge states (map 1:1 from A2A so the backend has one source):
  `submitted` -> Queued (grey), `working` -> Running (animated dot),
  `input-required` -> **Needs you** (high-contrast pill, the only one with a
  number), `auth-required` -> **Sign-in needed**, `completed` -> Done,
  `failed`/`rejected` -> Error, `canceled` -> Stopped, plus a derived
  **Stale** (no activity for N minutes; Linear uses 30, Plane 5).
- Separate **unread** (a dot) from **needs-you** (a pill): unread means "the
  agent said something since you last looked"; needs-you means "the agent is
  blocked on you". Never merge them; Linear, Copilot, Jules and Cursor all
  treat the blocked state as the push-worthy one.
- Add a board-level "Needs you (3)" filter chip at the top; tapping it cycles
  through blocked cards.
- Unread is a per-person cursor (`last_seen_at` per card), computed with
  ListTasks-style `statusTimestampAfter`, not a flag the agent sets.

### R4. Card = one conversation (contextId), runs inside it (P1)

- Tapping a card opens the **whole** conversation for that card, across runs;
  never ask the person to choose a session first.
- Show run boundaries as thin separators ("Run 3 - started 14:02 - done").
- Follow-up after a completed run starts a **new task in the same context**
  with `referenceTaskIds` to the previous one (A2A rule: terminal tasks reject
  messages). The person just types; the client decides "same taskId if
  interrupted, new taskId otherwise".
- Fetch with a `historyLength` cap (e.g. last 30 messages) and lazy-load older
  runs on scroll-up.

### R5. Layered history: messages, collapsed steps, pinned plan (P1)

- First-class rows: person messages, agent responses, agent questions
  (elicitations), errors.
- Tool calls and thoughts collapse into one row per burst: "Ran 7 steps -
  edited 3 files - 1 test failed", expandable. While live, show only the
  latest step as an ephemeral line that is replaced (Linear ephemeral
  activities).
- Pin the **plan** as a compact checklist directly under the header (n/m done,
  current step highlighted), expandable; replace it wholesale on update.
- Artifacts (PR, screenshot, file, link) render as cards with a single primary
  action.

### R6. Context header: what, who, state, and the exits (P2)

- Two lines max at 390 px: line 1 card title (truncate) + state pill; line 2
  agent avatar/name, column, elapsed time, and "last activity 2 min ago"
  (liveness proof).
- Header actions: **Stop** (always visible while running, Linear/Copilot),
  overflow menu with: open full card, copy link, reassign agent, open external
  session (`externalUrls` equivalent).
- If several agents have touched the card, show stacked avatars; tapping one
  filters the history to that agent (Cursor subagent transcripts, Linear
  multiple delegates over time).

### R7. Quick actions above the composer, structured asks as buttons (P2)

- When state is needs-you, render the agent's question with **option buttons**
  (Linear/Plane `select`) and the free-text composer below as fallback.
- Default chip row (horizontally scrollable, 32-36 px tall, but each chip has a
  44 px hit area): "Continue", "Approve plan", "Stop", "Summarise",
  "What's blocking?", "Open result". Chips change by state; never show
  "Continue" on a running card.
- Auth-required renders as a single "Sign in to X" button that opens the
  person's own flow (consistent with the project rule that the person types
  credentials themselves), never a text field in the chat.
- Every action chip posts a visible message into history ("You: Approve plan")
  so the log stays the record.

### R8. Deep link per card, round-trippable through Telegram (P2)

- Every card and every needs-you notification carries a link that opens the
  Mini App **inside Telegram** straight into that card's sheet:
  `https://t.me/<bot>/<app>?startapp=card_<id>` (or the project's existing
  `?start=app_<route>` convention). Optional suffix for detent/anchor:
  `card_<id>_q` = open at the pending question.
- Keep payloads to `[A-Za-z0-9_-]` and short; the exact Telegram length limit
  for `startapp` should be re-checked before relying on it [unverified].
- The router must treat an unknown or expired card id explicitly ("This task
  no longer exists - open board") instead of silently falling back to the
  feed.
- Mirror the state in the iframe URL (`#/board/card/<id>`) so reload and
  Back restore the sheet.
- Bot notification text = the agent's question verbatim + inline button
  "Answer" with the deep link (Cursor/Jules push "needs input").

### R9. Offline, streaming and reconnect states that never lie (P2)

- Stream agent output token-by-token into a single growing bubble; show a
  typing indicator only while bytes actually arrive. If nothing arrives for
  ~20 s while state is `working`, change the header line to "No activity for
  20 s" (not a spinner forever - the Codex "active but silent" failure).
- On reconnect, resubscribe and treat the first event as the full current
  state (A2A `SubscribeToTask` rule), then diff into the list; never show
  stale "Running" from cache without a timestamp.
- Offline: banner at the top of the sheet "Offline - messages will send when
  you reconnect"; outgoing messages render immediately with a clock icon,
  retry automatically, and on failure show "Not sent - tap to retry". The
  agent keeps working server-side (Codex behaviour); say so.
- Pause expensive streaming on Telegram `deactivated`; resync on `activated`.

### R10. Accessibility and touch ergonomics (P2)

- Sheet = `role="dialog"`, `aria-modal="true"`, `aria-labelledby` -> card
  title; move focus to the header on open, return focus to the tapped card on
  close; Escape and Telegram Back close/collapse.
- History container = `role="log"` (implicit `aria-live="polite"`), so new
  agent messages are announced without stealing focus; announce state changes
  ("Agent needs your input") through a separate `role="status"` region; use
  `aria-live="assertive"` only for needs-you.
- Do not announce every streamed token: announce the message once it is
  complete.
- Status is never colour-only: pill text + icon ("Needs you", "Running").
- Hit targets >= 44x44 pt; grabber and detent changes also reachable by
  buttons (screen readers cannot drag): "Expand" / "Collapse" in the header.
- Respect `prefers-reduced-motion` (no pulsing dot, no sheet spring); use
  `themeParams` colours with a contrast check, because Telegram themes are
  user-chosen.
- Haptics (`HapticFeedback.notificationOccurred`) on needs-you arrival and on
  send - but never as the only signal.

### Priority order (what to build first)

1. R4 + R5 data model (card = context, runs = tasks, layered history).
2. R3 badges (needs-you vs unread) - it is what makes the board useful.
3. R1 + R2 sheet and composer inside Telegram constraints.
4. R7 structured asks and Stop.
5. R8 deep links + bot notifications.
6. R9 liveness/offline, R6 header polish, R10 accessibility pass (R10 is
   cheap if done with R1/R2, expensive later - schedule it with them).

---

## 5. Open questions / not verified

- Exact geometry of Linear's agent panel on desktop and on mobile (side panel
  vs inline vs full screen) - only changelog wording seen.
- Linear signal names (`auth`, `select`, `stop`, `continue`) and their metadata
  shape - from third-party bridges, not Linear's page.
- Codex mobile layout specifics (tab names, sheet vs page) - OpenAI pages
  returned 403; relied on press and community write-ups.
- Cursor "up to eight agents" in Live Activities and subagent cards - from
  docs summaries, not fetched directly.
- Devin's current session layout and sleep/wake details - older reviews and
  release-notes summaries.
- Whether any of these products shows an explicit per-card "unread" dot on a
  board view (as opposed to inbox/notifications) - not found; the
  recommendation in R3 is a design inference.
- Telegram `startapp` maximum length and allowed characters - re-check
  core.telegram.org before relying on long payloads.
- Asana Teammate chat placement after the 2026-06 redesign.

---

## Sources

Linear

- https://linear.app/docs/agents-in-linear
- https://linear.app/docs/assigning-issues
- https://linear.app/docs/coding-sessions
- https://linear.app/developers/agent-interaction
- https://linear.app/developers/agent-best-practices
- https://linear.app/now/our-approach-to-building-the-agent-interaction-sdk
- https://linear.app/changelog/2025-07-30-agent-interaction-guidelines-and-sdk
- https://linear.app/changelog/2025-09-19-auto-apply-triage-suggestions
- https://linear.app/changelog/2025-10-16-mobile-app-redesign
- https://linear.app/changelog/2026-03-12-ui-refresh
- https://linear.app/changelog/2026-05-27-linear-diffs
- https://linear.app/changelog/2026-07-30-coding-sessions-on-mobile
- https://hookdeck.com/webhooks/platforms/how-to-build-linear-agents-with-hookdeck-cli
- https://github.com/tokezooo/linear-agent-bridge

GitHub Copilot

- https://github.blog/ai-and-ml/github-copilot/how-to-orchestrate-agents-using-mission-control/
- https://github.blog/changelog/2025-10-28-a-mission-control-to-assign-steer-and-track-copilot-coding-agent-tasks/
- https://github.blog/changelog/2025-10-28-ask-copilot-coding-agent-to-make-changes-in-any-pull-request-with-copilot/ <!-- secret-guard-ok: blog URL slug "ask-copilot", not a key -->
- https://github.blog/news-insights/product-news/agents-panel-launch-copilot-coding-agent-tasks-anywhere-on-github/
- https://github.blog/changelog/2025-09-24-start-and-track-copilot-coding-agent-tasks-in-github-mobile/
- https://github.blog/changelog/2026-04-01-github-mobile-stay-in-flow-with-a-refreshed-copilot-tab-and-native-session-logs/
- https://github.blog/changelog/2026-04-08-github-mobile-research-and-code-with-copilot-cloud-agent-anywhere/
- https://docs.github.com/en/copilot/concepts/agents/cloud-agent/agent-management
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/track-copilot-sessions
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-mobile
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/troubleshoot-coding-agent

OpenAI Codex

- https://learn.chatgpt.com/docs/cloud
- https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex (403 to fetcher; via search summary)
- https://openai.com/index/introducing-upgrades-to-codex/ (via search summary)
- https://openai.com/index/work-with-codex-from-anywhere/ (403 to fetcher)
- https://developers.openai.com/codex/changelog
- https://thenewstack.io/openai-codex-chatgpt-mobile/
- https://siliconangle.com/2026/09/29/openais-codex-gets-reusable-cloud-environments-that-follow-developers-across-devices/
- https://github.com/openai/codex/issues/49505

Devin

- https://docs.devin.ai/integrations/linear
- https://docs.devin.ai/integrations/jira
- https://docs.devin.ai/integrations/slack
- https://docs.devin.ai/release-notes/overview
- https://docs.devin.ai/release-notes/2026
- https://thegroundtruth.media/p/devin-first-impressions
- https://ppaolo.substack.com/p/in-depth-product-analysis-devin-cognition-labs

Cursor

- https://cursor.com/help/ai-features/background-agents
- https://cursor.com/docs/cloud-agent
- https://cursor.com/changelog/ios-mobile-app
- https://cursor.com/blog/ios-mobile-app
- https://siliconangle.com/2025/06/30/anyspheres-cursor-brings-ai-coding-agents-web-mobile-browsers/

Google Jules

- https://jules.google/docs/running-tasks/
- https://jules.google/docs/review-plan/
- https://jules.google/docs/faq/
- https://jules.google/docs/changelog/
- https://developers.google.com/jules/api

Factory

- https://factory.com/product/web
- https://factory.ai/product/ai-project-manager
- https://docs.factory.com/factory-app/overview

Plane, Asana, Height

- https://developers.plane.so/dev-tools/agents/overview
- https://developers.plane.so/dev-tools/agents/signals-content-payload
- https://plane.so/ai
- https://help.asana.com/s/article/ai-teammates?language=en_US
- https://asana.com/resources/ai-teammates-overview
- https://ido-clarity.com/blog/asana-ai-teammates-guide/
- https://www.toolify.ai/tool/height-copilot

A2A

- https://a2a-protocol.org/latest/specification/
- https://a2a-protocol.org/v1.0.0/specification/
- https://github.com/a2aproject/A2A/releases
- https://docs.langchain.com/langsmith/server-a2a
- https://mastra.ai/blog/what-is-agent-to-agent-protocol
- https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year

Mobile UI and accessibility references

- https://core.telegram.org/bots/webapps
- https://developer.apple.com/design/human-interface-guidelines/sheets
- https://m3.material.io/components/bottom-sheets
- https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/log_role
