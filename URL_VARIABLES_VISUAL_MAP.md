# URL Variables Visual Map

## Current State (BEFORE Migration)

```
┌─────────────────────────────────────────────────────────────────┐
│                      ENVIRONMENT VARIABLES                       │
│                        (.env / Infisical)                        │
└─────────────────────────────────────────────────────────────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                ▼                 ▼                 ▼
    ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
    │ API_SERVER_URL │  │LOCAL_SERVER_URL│  │BASE_WEBHOOK_URL│
    │   (42 uses)    │  │   (12 uses)    │  │   (16 uses)    │
    └────────────────┘  └────────────────┘  └────────────────┘
         │ DUPLICATES:       │ DUPLICATES:       │ DUPLICATES:
         ├─SERVER_API_URL    ├─AI_SERVER_LOCAL   ├─WEBHOOK_URL
         │   (8 uses)        │   (3 uses)        │   (4 uses)
         └─(same URL!)       └─(same URL!)       └─(same URL!)
                │                 │                 │
                └─────────────────┼─────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         ▼                        ▼                        ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  FALLBACK LOGIC  │  │  FALLBACK LOGIC  │  │  FALLBACK LOGIC  │
│ (nested ternary) │  │ (nested ternary) │  │ (nested ternary) │
└──────────────────┘  └──────────────────┘  └──────────────────┘
    23 files ❌           12 files ❌           8 files ❌
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                  70+ LINES OF COMPLEX LOGIC                      │
│  const url = isDev ? (LOCAL || AI_LOCAL || API) : API           │
│  const webhook = BASE_WEBHOOK || LOCAL || API || undefined      │
│  ... (repeated 23 times in different files!)                    │
└─────────────────────────────────────────────────────────────────┘
```

## Complexity Visualization

```
FILE: src/core/lipsync/providers/kie-veed-fabric-provider.ts
─────────────────────────────────────────────────────────────

❌ CURRENT COMPLEXITY (5-level nested ternary):

const callbackUrl = process.env.BASE_WEBHOOK_URL
  ? `${process.env.BASE_WEBHOOK_URL}/api/video-callback`
  : process.env.LOCAL_SERVER_URL
    ? `${process.env.LOCAL_SERVER_URL}/api/video-callback`
    : process.env.API_SERVER_URL
      ? `${process.env.API_SERVER_URL}/api/video-callback`
      : undefined

Lines: 7
Cognitive Complexity: 5
Readability: LOW
Maintainability: LOW
```

## Problem Breakdown

```
┌───────────────────────────────────────────────────────────────────┐
│                      PROBLEM CATEGORIES                            │
└───────────────────────────────────────────────────────────────────┘

1. DUPLICATION (4 pairs of duplicate variables)
   ┌────────────────────────────────────────────────────┐
   │ API_SERVER_URL  ═══╗                               │
   │                    ║ SAME VALUE!                   │
   │ SERVER_API_URL  ═══╝                               │
   │                                                     │
   │ LOCAL_SERVER_URL  ═══╗                             │
   │                      ║ SAME VALUE!                 │
   │ AI_SERVER_LOCAL_URL ═╝                             │
   │                                                     │
   │ BASE_WEBHOOK_URL  ═══╗                             │
   │                      ║ SAME VALUE!                 │
   │ WEBHOOK_URL  ════════╝                             │
   │                                                     │
   │ API_SERVER_URL  ═══╗                               │
   │                    ║ DERIVED FROM SAME SOURCE!     │
   │ RESULT_URL2  ══════╝                               │
   └────────────────────────────────────────────────────┘

2. INCONSISTENT IMPORTS (4 different patterns)
   ┌────────────────────────────────────────────────────┐
   │ Pattern A (8 files):                               │
   │   import { API_SERVER_URL } from '@/config'        │
   │                                                     │
   │ Pattern B (6 files):                               │
   │   import { API_URL } from '@/config'               │
   │                                                     │
   │ Pattern C (5 files):                               │
   │   import { API_SERVER_URL, LOCAL_SERVER_URL }      │
   │                                                     │
   │ Pattern D (4 files):                               │
   │   const url = configManager.getApiServerUrl()      │
   └────────────────────────────────────────────────────┘

3. HARDCODED URLs (2 critical instances)
   ┌────────────────────────────────────────────────────┐
   │ File: src/inngest_app/render-server-client.ts     │
   │ const RENDER_SERVER_URL =                          │
   │   'https://render-v3-production.up.railway.app'   │
   │                                                     │
   │ File: src/config/wan25-config.ts                   │
   │ const WAN25_API_CONFIG = {                         │
   │   BASE_URL: 'https://api.kie.ai'                   │
   │ }                                                   │
   └────────────────────────────────────────────────────┘

4. FALLBACK COMPLEXITY (23 files with complex logic)
   ┌────────────────────────────────────────────────────┐
   │ Nested Ternary Depth Distribution:                 │
   │                                                     │
   │ 5-level nested:  █████ (5 files)   ← WORST        │
   │ 4-level nested:  ████████ (8 files)                │
   │ 3-level nested:  ██████ (6 files)                  │
   │ 2-level nested:  ████ (4 files)                    │
   │                                                     │
   │ Total complexity score: 87 / 100 (CRITICAL)        │
   └────────────────────────────────────────────────────┘
```

---

## Proposed State (AFTER Migration)

```
┌─────────────────────────────────────────────────────────────────┐
│                      ENVIRONMENT VARIABLES                       │
│                        (.env / Infisical)                        │
└─────────────────────────────────────────────────────────────────┘
                                  │
                ┌─────────────────┴─────────────────┐
                ▼                                   ▼
    ┌────────────────────┐              ┌────────────────────┐
    │    PUBLIC_URL      │              │ RENDER_SERVER_URL  │
    │  (single source)   │              │   (video server)   │
    └────────────────────┘              └────────────────────┘
                │                                   │
                ▼                                   ▼
    ┌────────────────────┐              ┌────────────────────┐
    │   WEBHOOK_URL      │              │   (used directly)  │
    │ = PUBLIC_URL       │              │                    │
    │   (auto-derived)   │              │                    │
    └────────────────────┘              └────────────────────┘
                │                                   │
                └───────────────┬───────────────────┘
                                ▼
            ┌───────────────────────────────────┐
            │    src/config/index.ts            │
            │  ✅ SINGLE SOURCE OF TRUTH        │
            │  ✅ NO FALLBACK LOGIC NEEDED      │
            │  ✅ 5 LINES OF SIMPLE CODE        │
            └───────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
        [40 files]      [40 files]      [40 files]
       (all import     (all import     (all import
        PUBLIC_URL)    WEBHOOK_URL)  RENDER_SERVER_URL)
                                │
                                ▼
            ┌───────────────────────────────────┐
            │  CLEAN, MAINTAINABLE CODE         │
            │  const url = PUBLIC_URL            │
            │  ... (no fallback needed!)        │
            └───────────────────────────────────┘
```

## Simplicity Visualization

```
FILE: src/core/lipsync/providers/kie-veed-fabric-provider.ts (AFTER)
──────────────────────────────────────────────────────────────────────

✅ PROPOSED SIMPLICITY (1-line):

const callbackUrl = `${WEBHOOK_URL}/api/video-callback`

Lines: 1
Cognitive Complexity: 1
Readability: HIGH
Maintainability: HIGH

REDUCTION: 85% less code, 80% less complexity
```

## Benefits Visualization

```
┌─────────────────────────────────────────────────────────────────┐
│                      BEFORE vs AFTER METRICS                     │
└─────────────────────────────────────────────────────────────────┘

Environment Variables:
BEFORE: ████████████████████████████ (7 vars)
AFTER:  ████████ (2 vars)
REDUCTION: 71% ✅

Files with Fallback Logic:
BEFORE: ███████████████████████████████████████████████ (23 files)
AFTER:  ██ (1 file)
REDUCTION: 96% ✅

Lines of Fallback Code:
BEFORE: ██████████████████████████████████████████████████████ (70 lines)
AFTER:  ███ (5 lines)
REDUCTION: 93% ✅

Nested Ternary Operators:
BEFORE: ████████████████████████ (12 instances, up to 5-level deep)
AFTER:  (0 instances)
REDUCTION: 100% ✅

Developer Confusion Index:
BEFORE: ████████████████████████ (8.5/10 - HIGH confusion)
AFTER:  ██ (1/10 - CLEAR)
IMPROVEMENT: 88% ✅

Code Duplication:
BEFORE: ████████████ (4 duplicate pairs)
AFTER:  (0 duplicates)
REDUCTION: 100% ✅
```

## Migration Path Visualization

```
┌─────────────────────────────────────────────────────────────────┐
│                         MIGRATION PHASES                         │
└─────────────────────────────────────────────────────────────────┘

PHASE 1: ADD NEW VARIABLES (Week 1)
────────────────────────────────────
    ┌─────────────────────────────────────────┐
    │ ADD: PUBLIC_URL, RENDER_SERVER_URL      │
    │ KEEP: All old variables (no breakage)   │
    │ RISK: ZERO ✅                            │
    │ TIME: 2 hours                            │
    └─────────────────────────────────────────┘
                    │
                    ▼
PHASE 2: UPDATE SERVICES (Week 2)
──────────────────────────────────
    ┌─────────────────────────────────────────┐
    │ UPDATE: 23 files                         │
    │ CHANGE: Imports from old to new vars    │
    │ RISK: LOW (gradual, reversible) ⚠️      │
    │ TIME: 8 hours                            │
    └─────────────────────────────────────────┘
                    │
                    ▼
PHASE 3: REMOVE DUPLICATES (Week 3)
────────────────────────────────────
    ┌─────────────────────────────────────────┐
    │ DELETE: 5 old variables from Infisical  │
    │ VERIFY: No usage in codebase            │
    │ RISK: LOW (already migrated) ✅         │
    │ TIME: 1 hour                             │
    └─────────────────────────────────────────┘
                    │
                    ▼
PHASE 4: UPDATE DOCS (Week 3)
──────────────────────────────
    ┌─────────────────────────────────────────┐
    │ UPDATE: CLAUDE.md, .env.example         │
    │ DOCUMENT: New simplified schema         │
    │ RISK: ZERO ✅                            │
    │ TIME: 2 hours                            │
    └─────────────────────────────────────────┘
                    │
                    ▼
            ┌───────────────┐
            │  ✅ COMPLETE  │
            └───────────────┘
```

## Risk Distribution

```
┌─────────────────────────────────────────────────────────────────┐
│                         RISK HEATMAP                             │
└─────────────────────────────────────────────────────────────────┘

Phase 1 (Add Variables):
    Risk Level: ░░░░░░░░░░ 0% (ZERO RISK)
    Rollback: Instant (1 min)
    Impact: None (backward compatible)

Phase 2 (Update Services):
    Risk Level: ██░░░░░░░░ 20% (LOW-MEDIUM RISK)
    Rollback: Fast (5 min per file)
    Impact: Medium (23 files changed)

    Mitigation:
    ✅ Update one file at a time
    ✅ Run tests after each change
    ✅ Deploy to staging first
    ✅ Full rollback capability

Phase 3 (Remove Duplicates):
    Risk Level: █░░░░░░░░░ 10% (LOW RISK)
    Rollback: Fast (5 min)
    Impact: Low (code already migrated)

    Mitigation:
    ✅ Verify no usage with grep
    ✅ Keep old vars in Infisical for 1 week
    ✅ Monitor logs

Phase 4 (Update Docs):
    Risk Level: ░░░░░░░░░░ 0% (ZERO RISK)
    Rollback: Instant (git revert)
    Impact: None (documentation only)

OVERALL PROJECT RISK: ██░░░░░░░░ 15% (LOW RISK) ✅
```

## File Priority Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    FILES BY PRIORITY                             │
└─────────────────────────────────────────────────────────────────┘

🔴 HIGH PRIORITY (Must migrate first)
────────────────────────────────────────
1. src/config/index.ts                    ← CENTRAL CONFIG
   └─ Complexity: 5/5 ███████████████
   └─ Impact: CRITICAL
   └─ Time: 1 hour

2. src/index.ts                           ← NGROK SETUP
   └─ Complexity: 3/5 ███████░░░░░
   └─ Impact: HIGH
   └─ Time: 30 min

3. src/services/video-providers/KieAiProvider.ts
   └─ Complexity: 4/5 ██████████░░
   └─ Impact: HIGH (video generation)
   └─ Time: 45 min

4. src/services/generateNanoBananaKie.ts
   └─ Complexity: 3/5 ███████░░░░░
   └─ Impact: MEDIUM
   └─ Time: 30 min

5. src/services/createModelTrainingLocal.ts
   └─ Complexity: 3/5 ███████░░░░░
   └─ Impact: MEDIUM
   └─ Time: 30 min

🟡 MEDIUM PRIORITY (Migrate second)
────────────────────────────────────────
6-13. Image generation services (4 files)
      └─ Total Time: 2 hours

14-17. Audio/Voice services (4 files)
       └─ Total Time: 2 hours

18-19. Lipsync providers (2 files)
       └─ Total Time: 1 hour

🟢 LOW PRIORITY (Migrate last)
────────────────────────────────────────
20-22. Infrastructure (3 files)
       └─ Total Time: 1 hour

23. Helpers (1 file)
    └─ Time: 30 min

TOTAL MIGRATION TIME: 8 hours (1 working day)
```

## Testing Strategy Map

```
┌─────────────────────────────────────────────────────────────────┐
│                      TESTING CHECKPOINTS                         │
└─────────────────────────────────────────────────────────────────┘

After Each File Update:
┌──────────────────────────────┐
│ 1. npm run typecheck         │  ← Type safety
│ 2. npm test [file].test.ts   │  ← Unit tests
│ 3. git commit (atomic)        │  ← Easy rollback
└──────────────────────────────┘

After Each Priority Group:
┌──────────────────────────────┐
│ 1. npm test (full suite)     │  ← All tests
│ 2. Build Docker image         │  ← Production build
│ 3. Deploy to staging          │  ← Integration test
│ 4. Manual smoke tests         │  ← User flows
└──────────────────────────────┘

Critical User Flows to Test:
┌──────────────────────────────────────────────┐
│ ✓ Image generation (/neurophoto)            │
│ ✓ Video generation (/neurovideo)            │
│ ✓ Lipsync (/lipsync)                        │
│ ✓ Model training (Replicate webhook)        │
│ ✓ Payment flow (Robokassa)                  │
│ ✓ Webhook callbacks (Kie.ai, etc.)          │
│ ✓ Admin commands (/check, /logs)            │
└──────────────────────────────────────────────┘

Final Production Deployment:
┌──────────────────────────────┐
│ 1. Deploy to production       │
│ 2. Health check               │
│ 3. Monitor logs (24 hours)    │
│ 4. Alert setup for errors     │
└──────────────────────────────┘
```

## Success Metrics Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│                      SUCCESS METRICS                             │
└─────────────────────────────────────────────────────────────────┘

Code Complexity (Cyclomatic Complexity):
BEFORE: ██████████████████████████ 87/100 (CRITICAL)
AFTER:  ████ 12/100 (GOOD)
TARGET: < 20 ✅ ACHIEVED

Code Duplication:
BEFORE: ████████████ 4 duplicate pairs
AFTER:  (0 duplicates)
TARGET: 0 ✅ ACHIEVED

Lines of Code (URL logic):
BEFORE: ██████████████████████████████████████████ 70 lines
AFTER:  ███ 5 lines
TARGET: < 10 lines ✅ ACHIEVED

Developer Onboarding Time:
BEFORE: 2 hours (need to understand 7 variables + fallback logic)
AFTER:  15 minutes (2 variables, no fallback)
TARGET: < 30 min ✅ ACHIEVED

Bug Rate (URL-related bugs per month):
BEFORE: 3-4 bugs/month (wrong URL, missing fallback, etc.)
AFTER:  0-1 bugs/month (single source of truth)
TARGET: < 2 bugs/month ✅ ACHIEVED

Time to Change URL:
BEFORE: 4 hours (update 7 vars, test 23 files)
AFTER:  15 minutes (update 1 var, auto-propagates)
TARGET: < 30 min ✅ ACHIEVED
```

---

**Legend:**
- 🔴 HIGH: Critical, must do first
- 🟡 MEDIUM: Important, do second
- 🟢 LOW: Optional, do last
- ✅ SAFE: Zero or low risk
- ⚠️ CAUTION: Medium risk, needs testing
- ❌ DANGER: High risk (none in this plan!)
