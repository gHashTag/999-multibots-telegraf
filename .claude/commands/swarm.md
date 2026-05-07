---
description: "Launch intelligent Vibe swarm with auto-detection of required agents"
argument-hint: "<complex task or 'analyze' for codebase analysis>"
---

# Vibe Intelligent Swarm

Auto-detect and launch the optimal combination of Vibe agents for: **$ARGUMENTS**

## Auto-Detection Rules

### Task Type Detection

**If task mentions "scene", "wizard", "telegram", "bot":**
→ Primary: `vibe-telegram-scene`
→ Support: `vibe-tdd`, `vibe-code-reviewer`

**If task mentions "deploy", "production", "release":**
→ Primary: `vibe-deploy`, `vibe-devops`
→ Support: `vibe-health`, `vibe-docker-test`

**If task mentions "test", "coverage", "TDD":**
→ Primary: `vibe-tdd`, `vibe-docker-test`
→ Support: `vibe-code-reviewer`

**If task mentions "refactor", "optimize", "performance":**
→ Primary: `vibe-optimizer`, `vibe-architecture`
→ Support: `vibe-anti-duplication`, `vibe-code-reviewer`

**If task mentions "error", "bug", "fix":**
→ Primary: `vibe-error-fixer`
→ Support: `vibe-memory`, `vibe-tdd`

**If task mentions "inngest", "background", "async", "job":**
→ Primary: `vibe-inngest`
→ Support: `vibe-tdd`

**If task mentions "user", "balance", "subscription":**
→ Primary: `vibe-user-manager`
→ Support: `vibe-architecture`

**If task is "analyze" or "audit":**
→ Launch FULL SWARM analysis (see below)

## Full Swarm Analysis Mode

When task is "analyze" or unspecified, launch comprehensive codebase audit:

### Phase 1: Discovery (5 parallel agents)
```
Launch simultaneously:
1. vibe-code-reviewer    → "Scan for code quality issues in src/"
2. vibe-architecture     → "Check Clean Architecture violations"
3. vibe-anti-duplication → "Find duplicate code patterns"
4. vibe-optimizer        → "Identify performance bottlenecks"
5. vibe-error-fixer      → "Search for potential runtime errors"
```

### Phase 2: Specialized Analysis (3 parallel agents)
```
Launch after Phase 1:
1. vibe-tdd          → "Analyze test coverage gaps"
2. vibe-telegram-scene → "Review scene patterns for issues"
3. vibe-inngest      → "Check background job configurations"
```

### Phase 3: Synthesis
Combine all findings into prioritized report:
- Critical issues (must fix)
- High priority (should fix soon)
- Medium priority (technical debt)
- Low priority (nice to have)

## Execution Protocol

### For Simple Tasks (1-2 agents needed)
```
Use Task tool ONCE with primary agent
Include support context in prompt
```

### For Medium Tasks (3-4 agents needed)
```
Use Task tool 3-4 times in SINGLE message (parallel)
Each agent gets isolated scope
Collect and synthesize results
```

### For Complex Tasks (5+ agents needed)
```
Phase 1: Launch 5 discovery agents in parallel
Wait for completion
Phase 2: Launch specialized agents based on Phase 1 findings
Synthesize all results
Present prioritized action plan
```

## Agent Communication Protocol

Each agent prompt MUST include:
```markdown
## Context
- Project: 999-multibots-telegraf (Telegram bot platform)
- Stack: TypeScript, Telegraf, Supabase, Inngest
- Your role: [specific agent role]

## Your Task
[Specific isolated task]

## Output Format
Save findings to: .claude/swarm-outputs/[agent-name]-[timestamp].md

## Constraints
- DO NOT modify files another agent might be editing
- Focus ONLY on your assigned scope
- Return summary max 500 words
```

## Quick Commands

- `/swarm analyze` - Full codebase audit
- `/swarm deploy` - Deployment preparation swarm
- `/swarm test` - Test coverage analysis swarm
- `/swarm refactor <area>` - Refactoring analysis for specific area
- `/swarm scene <name>` - Scene creation swarm

---

NOW: Detect task type from "$ARGUMENTS" and launch appropriate swarm configuration.
