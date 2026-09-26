#!/bin/bash
# tri agent [id] -- a catalogued agent at a glance, offline (no network).
#
# Without an id: every agent, its status and its daily-check canary.
# With an id: the card -- role, promise, skills, the prefixes that make an
# owner's rule its own ("Учёный: ...", "FPGA: ..."), the evidence it
# promises, its canary and answer rules, and whether its contract prompt
# exists (render chat.ts marketplaceAgentPrompt). The live verdicts are
# `tri verdicts`; the screens are /agents/<id> (dashboard) and
# /agents/<id>/work (its chat).
set -u
ROOT="${1:?repo root required}"
shift
ID="${1:-}"
cd "$ROOT/apps/vibee-editor/render" || exit 2
AGENT_ID="$ID" npx --no-install tsx -e '
const m = require("../packages/vibee-atoms/src/agent-marketplace")
const table = require("./src/agent/acceptance-canaries.json")
const { marketplaceAgentPrompt } = require("./src/agent/chat")
const id = process.env.AGENT_ID
const canary = a => table.agents.find(c => c.id === a)
if (!id) {
  for (const a of m.MARKETPLACE_AGENTS)
    console.log(`${a.icon} ${a.id.padEnd(10)} ${a.status.padEnd(9)} ${a.name.ru.padEnd(18)} ${canary(a.id) ? "canary" : "NO CANARY"}`)
  process.exit(0)
}
const a = m.marketplaceAgentById(id)
if (!a) { console.log(`no agent "${id}"; tri agent lists them`); process.exit(2) }
console.log(`${a.icon} ${a.name.ru} / ${a.name.en} -- ${a.status}`)
console.log(`role:     ${a.role.ru}`)
console.log(`promise:  ${a.promise.ru}`)
console.log(`skills:   ${a.skills.map(s => s.ru).join(" · ")}`)
console.log(`rules:    "${m.agentSkillPrefix(a.id, "ru")}: ..." or "${m.agentSkillPrefix(a.id, "en")}: ..." (prefixes ${a.skillPrefixes.join(", ")})`)
for (const e of a.evidence) console.log(`never:    ${e.ru}`)
const c = canary(a.id)
console.log(c ? `canary:   ${c.canary}\n          expects ${c.expect.join(", ") || "(no tool)"}; answer rules: ${(c.answer || []).map(r => r.why).join("; ") || "none"}` : "canary:   NONE -- the daily check never looks at it")
console.log(`contract: ${marketplaceAgentPrompt(a.id) ? "yes" : "NONE -- it answers as the general assistant"}`)
console.log(`screens:  /agents/${a.id} (dashboard) · /agents/${a.id}/work (chat) · in a client chat: Specialist`)
' 2>&1 | grep -v ExperimentalWarning
