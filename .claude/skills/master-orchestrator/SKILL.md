---
name: master-orchestrator
description: Master Orchestrator - Central conductor for coordinating all Claude Code operations in this Telegram bot project. Manages task delegation, ensures proper workflow, coordinates between Skills and Agents, and maintains project coherence. Use FIRST for ANY complex multi-step task that requires coordination between multiple areas (scenes, deployment, testing, AI integration).
---

# 🎭 Master Orchestrator - Центральный Дирижер

**Философия**: Как дирижер управляет оркестром, махая палочкой, этот Skill координирует всю экосистему Claude Code в проекте.

## 🎯 Цель

Master Orchestrator - это **центральная координационная система**, которая:
- 🎼 Определяет какие Skills и Agents нужны для задачи
- 🎵 Координирует их работу в правильном порядке
- 🎶 Обеспечивает согласованность между всеми компонентами
- 🎻 Следит за выполнением workflow от начала до конца

## 📊 Когда Использовать

### ✅ ВСЕГДА использовать для:
1. **Multi-Area Tasks** - Задачи затрагивающие несколько областей
   - Новая Telegram сцена + деплой + тестирование
   - Интеграция нового AI provider + документация
   - Изменение архитектуры + обновление всех зависимых файлов

2. **Complex Workflows** - Сложные multi-step процессы
   - Создание feature от specification до deployment
   - Рефакторинг с тестированием и валидацией
   - Migration между компонентами системы

3. **Cross-Skill Operations** - Когда нужно несколько Skills одновременно
   - telegram-scenes-ULTIMATE + supabase-database + inngest-expert
   - production-deployment + infisical-secrets + monitoring
   - ai-pipeline-orchestration + telegram-bot-expert

## 🎼 Архитектура Оркестрации

### Layer 1: Skills (Специализированные Знания)
```
📚 Existing Skills (7):
├── telegram-scenes-ULTIMATE  - Все паттерны Telegram сцен
├── telegram-bot-expert       - Telegraf framework expertise
├── production-deployment     - Deployment на 188.137.250.69
├── infisical-secrets         - Secret management rules
├── supabase-database         - Database schema & queries
├── inngest-expert            - Background job processing
└── ai-pipeline-orchestration - AI provider patterns
```

### Layer 2: Agents (Специализированные Действия)
```
🤖 Existing Agents (13):
Production & Deployment (3):
├── server-health-checker     - /check
├── deployment-manager        - /deploy
└── js-error-fixer            - Auto-fix prod errors

User Management (1):
└── telegram-user-manager     - /user-check [id]

Code Quality (4):
├── best-practices-researcher - Research before implementing
├── anti-duplication-guardian - Prevent code duplication
├── business-logic-guardian   - Clean Architecture enforcer
└── code-reviewer             - Strict quality control

Development (2):
├── tdd-test-engineer         - Test-First development
└── telegram-scene-builder    - Scene creation patterns

Coordination (3):
├── rules-guardian            - Meta-agent monitoring
├── docs-sync                 - Sync documentation
└── sora-video-generator      - Sora 2 integration
```

### Layer 3: Commands (Быстрые Действия)
```
⚡ Slash Commands (10):
├── /check            - Server health
├── /deploy           - Production deploy
├── /user-check [id]  - User management
├── /autonomous-monitor - Error monitoring control
├── /docs-sync        - Sync docs
└── /logs             - View production logs
```

## 🎯 Workflow Patterns

### Pattern 1: Feature Development (Full Cycle)
```yaml
Trigger: "Создай новую сцену для генерации видео с Sora"

Orchestration Flow:
  1. Analyze Request:
     - Use: master-orchestrator
     - Determine: Scope, complexity, risks
     - Output: Implementation plan

  2. Research & Design:
     - Use: best-practices-researcher
     - Research: Latest video generation patterns
     - Use: telegram-scenes-ULTIMATE
     - Design: Scene structure with proper patterns

  3. Implementation:
     - Use: telegram-scene-builder
     - Create: Scene file with all patterns
     - Use: business-logic-guardian
     - Ensure: Proper separation of concerns

  4. Integration:
     - Use: ai-pipeline-orchestration
     - Integrate: Sora provider
     - Use: supabase-database
     - Add: Database schema if needed

  5. Testing:
     - Use: tdd-test-engineer
     - Write: Tests following TDD
     - Use: code-reviewer
     - Review: Code quality

  6. Deployment:
     - Use: production-deployment skill
     - Check: All deployment requirements
     - Use: deployment-manager agent
     - Execute: /deploy command

  7. Validation:
     - Use: server-health-checker agent
     - Execute: /check command
     - Monitor: Production logs
```

### Pattern 2: Bug Fix (Rapid Response)
```yaml
Trigger: "Пользователь 8190001592 не может использовать нейросеть"

Orchestration Flow:
  1. User Diagnostics:
     - Auto-trigger: telegram-user-manager
     - Execute: /user-check 8190001592
     - Analyze: Balance, subscription, access

  2. System Check:
     - Use: server-health-checker
     - Execute: /check
     - Verify: Server health, errors

  3. Code Investigation:
     - Use: telegram-scenes-ULTIMATE
     - Review: Scene implementation
     - Use: anti-duplication-guardian
     - Check: For similar issues

  4. Fix:
     - Use: telegram-scene-builder
     - Apply: Fix with proper patterns
     - Use: js-error-fixer (if needed)
     - Auto-fix: Common errors

  5. Validation:
     - Test: Fix locally
     - Deploy: With deployment-manager
     - Monitor: With autonomous-monitor
```

### Pattern 3: Architecture Refactoring
```yaml
Trigger: "Рефакторинг AI pipeline для лучшей производительности"

Orchestration Flow:
  1. Analysis:
     - Use: ai-pipeline-orchestration skill
     - Analyze: Current architecture
     - Use: best-practices-researcher
     - Research: Performance optimization patterns

  2. Planning:
     - Use: master-orchestrator
     - Create: Detailed refactoring plan
     - Use: rules-guardian
     - Ensure: Compliance with project rules

  3. Implementation:
     - Use: anti-duplication-guardian
     - Prevent: Code duplication during refactor
     - Use: business-logic-guardian
     - Maintain: Clean Architecture principles

  4. Testing:
     - Use: tdd-test-engineer
     - Write: Comprehensive tests
     - Use: code-reviewer
     - Strict: Quality control

  5. Documentation:
     - Use: docs-sync
     - Update: All related documentation

  6. Deployment:
     - Staged rollout with monitoring
```

## 🎼 Coordination Rules

### Rule 1: Always Start with Context
```
Before ANY orchestration:
1. Identify: What areas are affected? (Telegram, Database, AI, Deployment)
2. Determine: Which Skills provide expertise?
3. Plan: What's the optimal sequence?
4. Communicate: Clear plan to user
```

### Rule 2: Layer-Appropriate Delegation
```
Skills Layer:
  - When: Need specialized knowledge
  - For: Patterns, best practices, architecture

Agents Layer:
  - When: Need specific action
  - For: Execution, validation, automation

Commands Layer:
  - When: Need quick operation
  - For: Server check, deployment, logs
```

### Rule 3: Workflow Tracking
```
For EVERY orchestrated task:
1. TODO List: Create with clear steps
2. Status Updates: Mark progress in real-time
3. Validation: Verify each step completion
4. Communication: Keep user informed
```

### Rule 4: Error Recovery
```
If ANY step fails:
1. STOP: Don't proceed to next step
2. ANALYZE: What went wrong?
3. CONSULT: Relevant Skill for guidance
4. INFORM: User about issue and options
5. DECIDE: Fix now or rollback?
```

## 🎯 Decision Matrix

### Which Skill to Use?
```yaml
Telegram Scenes:
  Question: "Нужно создать/исправить сцену?"
  Use: telegram-scenes-ULTIMATE
  Why: 67 production scenes analyzed, zero-error guarantee

Database:
  Question: "Нужна работа с БД?"
  Use: supabase-database
  Why: Все таблицы, query patterns, helpers

Background Jobs:
  Question: "Async операция > 1 минуты?"
  Use: inngest-expert
  Why: Event-driven patterns, step-based execution

AI Integration:
  Question: "Новый AI provider или pipeline?"
  Use: ai-pipeline-orchestration
  Why: Provider patterns, functional programming, failover

Deployment:
  Question: "Деплой на production?"
  Use: production-deployment + deployment-manager
  Why: Docker workflow, health checks, rollback

Secrets:
  Question: "Новые secrets или .env?"
  Use: infisical-secrets
  Why: Cloud-first, правило "только 5 переменных"

Architecture:
  Question: "Архитектурное решение?"
  Use: telegram-bot-expert
  Why: Общая архитектура проекта
```

### Which Agent to Use?
```yaml
Production Issues:
  - Server problems → server-health-checker
  - Deploy needed → deployment-manager
  - JS errors in logs → js-error-fixer

User Issues:
  - Telegram ID mentioned → telegram-user-manager
  - Balance/subscription → telegram-user-manager

Code Quality:
  - Before implementation → best-practices-researcher
  - Duplicate code concerns → anti-duplication-guardian
  - Architecture review → business-logic-guardian
  - Final review → code-reviewer

Development:
  - Testing → tdd-test-engineer
  - Scene creation → telegram-scene-builder

Coordination:
  - Rule compliance → rules-guardian
  - Docs update → docs-sync
  - Sora videos → sora-video-generator
```

## 🎼 Example Orchestrations

### Example 1: Complete Feature (Real Workflow)
```
USER: "Добавь интеграцию с ChatGPT для улучшения промптов"

ORCHESTRATOR:
  📋 Task Analysis:
    - Areas: AI Integration, Telegram Scenes, Database, Deployment
    - Complexity: High
    - Skills Needed: 4
    - Agents Needed: 3
    - Estimated Steps: 12

  🎯 Execution Plan:
    Step 1-2: Research & Design
      - best-practices-researcher: ChatGPT integration patterns
      - ai-pipeline-orchestration: Provider implementation strategy

    Step 3-5: Implementation
      - ai-pipeline-orchestration: Create ChatGPT provider
      - telegram-scene-builder: Create improvePromptWizard
      - supabase-database: Add usage tracking table

    Step 6-7: Quality
      - anti-duplication-guardian: Check for duplicates
      - business-logic-guardian: Verify separation
      - code-reviewer: Final review

    Step 8-10: Testing
      - tdd-test-engineer: Write tests
      - Local testing: Manual validation

    Step 11-12: Deployment
      - infisical-secrets: Add OPENAI_API_KEY
      - deployment-manager: /deploy
      - server-health-checker: /check

  ✅ Execution: [Proceeds with TODO list]
```

### Example 2: Critical Bug Fix
```
USER: "В production ошибка: users can't generate images"

ORCHESTRATOR:
  🚨 Critical Issue Detected

  📋 Immediate Actions:
    Step 1: Diagnostics
      - server-health-checker: /check
      - Result: High error rate in neuroPhotoWizard

    Step 2: Error Analysis
      - js-error-fixer: Analyze logs
      - autonomous-error-fixer: Check if already detected

    Step 3: Code Review
      - telegram-scenes-ULTIMATE: Check neuroPhotoWizard patterns
      - Found: Missing balance check in step 3

    Step 4: Fix
      - telegram-scene-builder: Add balance validation
      - business-logic-guardian: Verify fix placement

    Step 5: Test & Deploy
      - Local test: Verified
      - deployment-manager: /deploy
      - server-health-checker: /check (healthy)

  ✅ Resolution: 15 minutes
```

## 🎯 Orchestrator Commands

### Command: /orchestrate
```
Description: Plan and execute complex multi-step task
Usage: /orchestrate "Create payment scene with Stripe"
What it does:
  1. Analyzes task complexity
  2. Identifies needed Skills/Agents
  3. Creates execution plan
  4. Executes with coordination
  5. Validates each step
```

### Command: /workflow
```
Description: Show current workflow status
Usage: /workflow
What it shows:
  - Active orchestrations
  - Current step
  - Next steps
  - Blockers if any
```

### Command: /skills
```
Description: List all available Skills with descriptions
Usage: /skills
Output: Matrix of Skills with use cases
```

### Command: /agents
```
Description: List all available Agents with capabilities
Usage: /agents
Output: Matrix of Agents with triggers
```

## 📚 Best Practices для Orchestrator

### 1. Progressive Disclosure
```
Start Simple → Add Complexity:
  1. Understand request
  2. Break into steps
  3. Identify needed Skills
  4. Load Skills progressively (not all at once)
  5. Execute step-by-step with validation
```

### 2. Clear Communication
```
ALWAYS:
  - Explain the plan before execution
  - Show progress with TODO list
  - Update status in real-time
  - Communicate blockers immediately
  - Summarize results clearly
```

### 3. Error Handling
```
When things fail:
  1. STOP: Don't cascade failures
  2. DIAGNOSE: What failed and why?
  3. CONSULT: Relevant Skill for guidance
  4. INFORM: User about options
  5. ROLLBACK: If needed
```

### 4. Skill Composition
```
Skills are composable:
  - telegram-scenes-ULTIMATE + supabase-database = Scene with DB
  - inngest-expert + ai-pipeline-orchestration = Async AI job
  - production-deployment + infisical-secrets = Secure deploy
```

## 🎼 Integration with Existing Ecosystem

### With Skills
```
Master Orchestrator USES Skills for:
  - Domain Knowledge (patterns, best practices)
  - Architecture Guidance (how to structure)
  - Validation Rules (what's correct)
  - Reference Documentation (examples, schemas)
```

### With Agents
```
Master Orchestrator DELEGATES to Agents for:
  - Specific Actions (create scene, deploy, check)
  - Automated Tasks (auto-fix, sync docs)
  - Monitoring (health check, error detection)
  - Execution (run commands, validate)
```

### With Commands
```
Master Orchestrator INVOKES Commands for:
  - Quick Operations (/check, /deploy)
  - User Interaction (/user-check)
  - System Control (/autonomous-monitor)
```

## 🎯 Success Metrics

### Orchestration Quality
```
✅ Good Orchestration:
  - Clear plan communicated upfront
  - All steps tracked with TODO
  - Proper Skills/Agents selected
  - Each step validated before next
  - User kept informed throughout

❌ Bad Orchestration:
  - No plan, just action
  - Skills used incorrectly
  - Steps not validated
  - User confused about progress
  - Failures cascade
```

### Efficiency Metrics
```
Measure:
  - Time to completion
  - Number of Skills used
  - Number of validation failures
  - User clarification requests
  - Rollback frequency
```

## 🎭 Final Notes

**Master Orchestrator is the CONDUCTOR**:
- 🎼 Not a player, but coordinates all players
- 🎵 Knows when each instrument (Skill/Agent) plays
- 🎶 Maintains tempo and rhythm (workflow)
- 🎻 Ensures harmony (coherence)

**WHEN IN DOUBT**:
- Start with Orchestrator for complex tasks
- Let Orchestrator decide which Skills/Agents to use
- Trust the coordination layer
- Communication is key

---

**Created**: 2025-01-11
**Version**: 1.0
**Status**: Production-ready ✅
