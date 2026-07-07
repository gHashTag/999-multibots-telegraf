---
name: doctor
description: Run a full production health check for the Railway-deployed Telegram bot platform and report actionable findings.
---

# /doctor

Run the full diagnostic workflow from the `doctor` skill:

1. Check Railway deployment status.
2. Verify `/health` and `/api/health` endpoints.
3. Validate all 10 bot tokens and detect webhook conflicts.
4. Check AI provider health via `/api/providers`.
5. Check platform debt via `/api/billing`.
6. Scan recent Railway logs for critical errors.
7. Output a concise health report with action items.

If any check fails, apply the relevant fix from the skill and report what was done.
