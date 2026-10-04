---
name: 'zai-free-flash'
description: 'z.ai GLM flash models are FREE (owner, 2026-10-04): default every z.ai call to glm-4.7-flash, fallback glm-4.5-flash. Load when choosing or changing a GLM / z.ai model, when an agent turn fails with "1113 Insufficient balance" or "на ключе нет средств" on zai, when touching GLM_MODEL, AGENT_MODEL, LOG_MONITOR_MODEL or the provider catalogue in render/src/agent/provider.ts, or before writing glm-5.3 / glm-4.5 anywhere.'
---

# z.ai: the flash models are free

## The rule

**Default model for every z.ai call is `glm-4.7-flash`.** The fallback
(`zai-lite`) is `glm-4.5-flash`. Never put a paid GLM (`glm-5.3`, `glm-4.5`,
`glm-4.6`, `glm-4.7` without `-flash`) back as a default: the project key has
no balance, so a paid model there is a provider that always fails.

## The measurement (2026-10-04, project key `GLM_API_KEY`, zero balance)

| model             | coding `/api/coding/paas/v4`                                 | general `/api/paas/v4` |
| ----------------- | ------------------------------------------------------------ | ---------------------- |
| glm-5.3, glm-4.5  | 1113 Insufficient balance                                    | 1113                   |
| **glm-4.7-flash** | 200, tool calls OK, thinking on/off OK                       | 200                    |
| **glm-4.5-flash** | 200, tool calls OK, thinking on/off OK                       | 200                    |
| glm-5.3-flash     | 400 1210: thinking cannot be disabled (needs `low/high/max`) | same                   |

- Text only: an `image_url` part answers 400 code 1210. Vision and hearing stay
  with nemotron.
- A busy free tier answers **429 code 1305 "temporarily overloaded"**. That
  is load, not money. It's why the fallback runs the OTHER flash model.

## Where the default lives

| Place                                                                | Override variable                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------ |
| `apps/vibee-editor/render/src/agent/provider.ts` (`zai`, `zai-lite`) | `AGENT_MODEL` (only for the `AGENT_PROVIDER` provider) |
| `apps/vibee-editor/render/render-server.ts` (two provider lists)     | none                                                   |
| `src/core/openai/glm-provider.ts`, `src/core/openai/requests.ts`     | `GLM_MODEL`                                            |
| `src/inngest_app/functions/monitoring/logMonitor.ts`                 | `LOG_MONITOR_MODEL`, `GLM_MODEL`                       |

**Variables beat code.** On 2026-10-04 `GLM_MODEL=glm-5.3` (bot) and
`AGENT_MODEL=glm-5.3` (vibee-render) still pinned the paid model. A code change
alone does not move them; check with
`railway variables --project 999 --environment production --service <svc> --kv | grep MODEL`.

## Re-measure

```bash
GK=$(railway variables --project 999 --environment production --service vibee-render --kv | grep '^GLM_API_KEY=' | cut -d= -f2-)
curl -s https://api.z.ai/api/coding/paas/v4/chat/completions -H "Authorization: Bearer ${GK}" \
  -H 'Content-Type: application/json' \
  -d '{"model":"glm-4.7-flash","messages":[{"role":"user","content":"say ok"}],"max_tokens":20}'
unset GK
```
