---
# 🎭 CLAUDE CODE SKILLS ECOSYSTEM
**Complete self-organizing system for Telegram bot development**
---

# 📚 Skills Overview

**Total**: 14 specialized Skills covering ALL aspects of this project.

## 🎼 Master Skills (Always Use First)

### 1. **master-orchestrator** 🎭
**The Conductor** - Coordinates ALL operations like a symphony conductor.

**Use for**:
- ANY complex multi-step task
- Coordinating between multiple Skills/Agents
- Feature development from design to deployment
- Bug fixes requiring multiple systems
- Architecture changes

**Key Abilities**:
- Determines which Skills/Agents needed
- Creates execution plans
- Coordinates workflow
- Validates each step
- Ensures project coherence

**Example**: "Create new Sora video generation scene with DB integration and deployment"

---

### 2. **project-knowledge-base** 📚
**The Library** - Complete knowledge of project structure and patterns.

**Use for**:
- Finding file locations
- Understanding architecture
- Looking for similar implementations
- Checking project rules and patterns
- System interaction understanding

**Key Knowledge**:
- All 43+ scenes structure
- Database schema (10+ tables)
- AI pipeline architecture
- Deployment processes
- File organization

**Example**: "Where is the language detection helper?"

---

## 🎯 Domain-Specific Skills

### 3. **telegram-scenes-ULTIMATE** 🎯
**The Scene Master** - ZERO-ERROR guarantee for Telegram scenes.

**Expertise**:
- 67 production scenes analyzed
- Every pattern and anti-pattern
- Complete debugging guide
- Production-ready templates
- Error prevention rules

**Use for**:
- Creating NEW Telegram scenes
- Fixing EXISTING scenes
- Wizard flows
- User input validation
- Multi-step processes

**Stats**: 2000+ lines, 5 absolute rules, 8 anti-patterns, complete patterns library

---

### 4. **telegram-bot-expert** 🤖
**The Framework Expert** - Telegraf framework and bot architecture.

**Expertise**:
- Telegraf 4.16.3 patterns
- MyContext typing
- Scene registration
- Middleware stack
- Command patterns

**Use for**:
- Bot initialization
- Scene registration
- Middleware setup
- General architecture questions

---

### 5. **supabase-database** 💾
**The Database Oracle** - Complete database schema and query patterns.

**Expertise**:
- 10+ tables (users, assets, payments, etc.)
- Query patterns for each table
- Helper functions (getUserByTelegramId, updateUserBalance)
- Indexes and optimization
- Common errors

**Use for**:
- Database queries
- Creating new tables
- Migrations
- Optimizing queries
- Database errors

---

### 6. **inngest-expert** ⚡
**The Background Job Master** - Event-driven async operations.

**Expertise**:
- Event-driven architecture
- Step-based execution
- Retry strategies
- Concurrency control
- Webhook integration

**Use for**:
- Long-running operations (>1 minute)
- Model training (1-2 hours)
- Video generation
- Webhook processing
- Async AI tasks

**Critical Rule**: ALWAYS find similar function before creating new one!

---

### 7. **ai-pipeline-orchestration** 🎨
**The AI Maestro** - Multi-provider AI generation patterns.

**Expertise**:
- 10+ AI providers (Replicate, Fal, KieAI, OpenAI, etc.)
- Provider abstraction patterns
- Functional programming (TaskEither, pipe)
- LipSync system
- Failover logic

**Use for**:
- Integrating new AI providers
- Video/Image/Audio generation
- LipSync operations
- Provider failover
- Cost optimization

---

### 8. **production-deployment** 🚀
**The Deployment Expert** - Production deployment procedures.

**Expertise**:
- Server 188.137.250.69
- Docker workflow
- Health checks
- Rollback procedures
- Emergency procedures

**Use for**:
- Deploying to production
- Docker issues
- SSH operations
- Rollback procedures
- Production troubleshooting

---

### 9. **infisical-secrets** 🔐
**The Secret Keeper** - Cloud-first secret management.

**Expertise**:
- "ONLY 5 variables in .env" rule
- 50+ cloud secrets
- Infisical initialization
- Security best practices

**Use for**:
- Adding new secrets
- "Secret not found" errors
- .env questions
- Migration dev/prod
- Security questions

**Critical Rule**: AI agents MUST NEVER add secrets to .env!

---

## 🚑 System Skills

### 10. **error-recovery-debugging** 🚑
**The Healer** - Error recovery and debugging strategies.

**Expertise**:
- Common error patterns
- Diagnostic approaches
- Rollback procedures
- Automated recovery
- Prevention strategies

**Use for**:
- Encountering errors
- Debugging issues
- Recovering from failures
- Understanding error patterns
- Implementing prevention

**Categories**: Telegram, Database, AI Provider, Payment, Deployment errors

---

### 11. **docker-testing-expert** 🧪
**The Test Master** - Docker testing with full MCP observability.

**Expertise**:
- docker-compose.test.yml patterns
- Isolated test environments
- Unit/Integration/E2E testing
- MCP control ("eyes and hands")
- CI/CD integration

**Use for**:
- Setting up test environment
- Running tests in Docker
- Test debugging
- Performance benchmarking
- Pre-deployment validation

**Key Features**: Service profiles, real-time monitoring, test analytics

---

### 12. **task-tracker** 📋
**The Truth Keeper** - Single source of truth for current plan (analog of current_task.mdc).

**Expertise**:
- ✅/✏️/❌ Status tracking
- Plan updates after each action
- Git commit integration
- TDD cycle status
- Sanskrit wisdom guidance

**Use for**:
- Tracking complex multi-step tasks
- Maintaining plan coherence
- Preventing work duplication
- Git rollback references
- Coordinating between agents

**Key Principle**: "current_task - это наша карта. Без карты мы блуждаем в темноте."

---

### 13. **tdd-automation** 🧪
**The Test-First Guardian** - Automated TDD cycle enforcement (RED-GREEN-REFACTOR).

**Expertise**:
- 🔴 RED: Write failing test first
- 🟢 GREEN: Minimal implementation
- 🔵 REFACTOR: Code quality improvement
- Coverage tracking (80%+ target)
- Quality gates and pre-commit hooks

**Use for**:
- Enforcing test-first discipline
- Preventing "code before tests"
- Automating TDD workflow
- Ensuring test coverage
- Blocking untested code

**Key Principle**: "Tests are not afterthought. Tests are forethought. Code follows tests."

---

## 📊 Skills Matrix

### When to Use Which Skill?

| Task Category | Primary Skill | Supporting Skills |
|--------------|---------------|-------------------|
| **Complex Task** | master-orchestrator | ALL others as needed |
| **Find Something** | project-knowledge-base | - |
| **Create Scene** | telegram-scenes-ULTIMATE | telegram-bot-expert, supabase-database |
| **Database Work** | supabase-database | project-knowledge-base |
| **Background Job** | inngest-expert | ai-pipeline-orchestration |
| **AI Integration** | ai-pipeline-orchestration | inngest-expert |
| **Deployment** | production-deployment | infisical-secrets |
| **Add Secrets** | infisical-secrets | - |
| **Error/Debug** | error-recovery-debugging | project-knowledge-base |
| **Testing** | docker-testing-expert | tdd-test-engineer, tdd-automation |
| **Task Tracking** | task-tracker | master-orchestrator |
| **TDD Development** | tdd-automation | task-tracker, tdd-test-engineer |

---

## 🎼 How Skills Work Together

### Example: Complete Feature Development

```yaml
Task: "Add ChatGPT prompt improvement to the bot"

Orchestration:
  1. master-orchestrator
     → Analyzes task complexity
     → Creates execution plan
     → Identifies needed Skills

  2. project-knowledge-base
     → Finds similar implementations
     → Provides file locations
     → Shows existing patterns

  3. telegram-scenes-ULTIMATE
     → Designs improvePromptWizard
     → Provides scene template
     → Ensures all patterns followed

  4. ai-pipeline-orchestration
     → ChatGPT provider integration
     → Error handling patterns
     → Cost estimation

  5. supabase-database
     → Add usage tracking
     → Update user balance logic
     → Create migration if needed

  6. infisical-secrets
     → Add OPENAI_API_KEY to Infisical
     → Verify secret access

  7. production-deployment
     → Pre-deployment checklist
     → Deploy to production
     → Health verification

  8. error-recovery-debugging
     → Monitor for issues
     → Quick recovery if needed

Result: Feature deployed successfully with all best practices
```

---

## 🎯 Quick Start Guide

### For ANY Task:

**Step 1**: Start with **master-orchestrator**
- Describe your task
- Let it analyze and plan
- Review the plan

**Step 2**: Master Orchestrator loads needed Skills automatically
- It knows which Skills are relevant
- Loads them progressively (not all at once)
- Uses them in correct order

**Step 3**: Follow the coordinated workflow
- Clear TODO list with steps
- Each step validated
- Progress communicated

---

## 📋 Skill Composition Patterns

### Pattern 1: Scene with Database
```
Skills:
  - telegram-scenes-ULTIMATE  (structure)
  + supabase-database         (data operations)
  = Scene with proper DB integration
```

### Pattern 2: Async AI Operation
```
Skills:
  - inngest-expert            (background job)
  + ai-pipeline-orchestration (AI provider)
  = Long-running AI generation with proper async handling
```

### Pattern 3: Secure Deployment
```
Skills:
  - production-deployment     (deployment process)
  + infisical-secrets         (secret management)
  + error-recovery-debugging  (monitoring)
  = Safe production deployment with monitoring
```

---

## 🎭 Philosophy: The Orchestra Metaphor

```
🎼 Master Orchestrator = Conductor
   - Waves the baton
   - Coordinates all musicians
   - Maintains tempo and harmony

📚 Project Knowledge Base = Music Library
   - Has all the scores
   - Knows where everything is
   - Reference for all musicians

🎯 Domain Skills = Musical Sections
   - telegram-scenes-ULTIMATE = Strings (melody)
   - supabase-database = Percussion (rhythm)
   - ai-pipeline-orchestration = Brass (power)
   - inngest-expert = Woodwinds (background)

🚑 System Skills = Stage Management
   - error-recovery-debugging = First aid
   - production-deployment = Stage director
   - infisical-secrets = Security
```

---

## 📊 Coverage Matrix

### What's Covered:

✅ **Telegram Bot Development**
- Scene patterns (telegram-scenes-ULTIMATE)
- Framework expertise (telegram-bot-expert)
- User management
- Language detection
- Session management

✅ **Backend Systems**
- Database operations (supabase-database)
- Background jobs (inngest-expert)
- API integrations
- Webhook handling

✅ **AI Integration**
- Provider patterns (ai-pipeline-orchestration)
- Multi-provider failover
- Cost optimization
- Error handling

✅ **Operations**
- Deployment (production-deployment)
- Secret management (infisical-secrets)
- Error recovery (error-recovery-debugging)
- Health monitoring

✅ **Project Management**
- Coordination (master-orchestrator)
- Knowledge base (project-knowledge-base)
- Documentation
- Best practices

---

## 🚀 Advanced Usage

### Progressive Disclosure

Skills use **progressive disclosure** - load information only as needed:

1. **Description** loaded first (small)
2. **Full skill** loaded when relevant (medium)
3. **Examples/Docs** loaded on demand (large)

This means:
- Fast initial context loading
- Efficient token usage
- Unbounded skill size possible

### Skill Nesting

Master Orchestrator can invoke sub-skills:
```
master-orchestrator
  → project-knowledge-base (find files)
    → telegram-scenes-ULTIMATE (scene patterns)
      → Examples from neuroPhotoWizard
      → Anti-patterns list
      → Debugging guide
```

### Context-Aware Activation

Skills activate based on keywords in your request:
- "scene" → telegram-scenes-ULTIMATE
- "database" → supabase-database
- "deploy" → production-deployment
- "error" → error-recovery-debugging
- "find" → project-knowledge-base

---

## 📚 Related Documentation

### Internal
```
.claude/skills/           - This directory
.claude/agents/           - Sub-agents (13)
.claude/commands/         - Slash commands (10)
CLAUDECODE_RULES.md       - Critical rules
docs/                     - Project docs
```

### External
```
Claude Code:
  - https://code.claude.com/docs/en/skills
  - https://docs.claude.com/agents-and-tools/agent-skills

Frameworks:
  - Telegraf: https://telegraf.js.org/
  - Inngest: https://www.inngest.com/docs
```

---

## 🎯 Best Practices

### DO:
✅ Start complex tasks with master-orchestrator
✅ Use project-knowledge-base to find things
✅ Follow telegram-scenes-ULTIMATE for scenes
✅ Always check error-recovery-debugging for errors
✅ Let Skills coordinate naturally

### DON'T:
❌ Try to use all Skills at once
❌ Skip master-orchestrator for complex tasks
❌ Ignore skill recommendations
❌ Add secrets to .env (infisical-secrets rule!)
❌ Deploy without production-deployment skill

---

## 📊 Statistics

**Coverage**:
- 43+ Telegram scenes → 100% documented
- 10+ database tables → 100% covered
- 10+ AI providers → All patterns documented
- Deployment process → Fully documented
- Error patterns → Continuously updated

**Quality**:
- telegram-scenes-ULTIMATE: 2000+ lines, ZERO-ERROR guarantee
- All Skills: Production-tested patterns
- Real code examples from actual project
- Continuously updated with new learnings

---

## 🔄 Continuous Improvement

### Skills are Living Documents:

**Update When**:
- New patterns discovered
- Architecture changes
- New features added
- Errors patterns emerge
- Best practices evolve

**How to Update**:
1. Edit SKILL.md in skill directory
2. Add new patterns/examples
3. Update documentation
4. Claude Code auto-reloads

---

## 🎭 Final Word

**This Skills Ecosystem enables Claude Code to:**
- 🎼 Self-organize like an orchestra
- 🎯 Make correct decisions autonomously
- 📚 Access project knowledge instantly
- 🚑 Recover from errors quickly
- 🎨 Compose Skills for complex tasks
- ⚡ Work efficiently with proper patterns

**Result**: Claude Code becomes a **true assistant** that understands your project deeply and can work independently with confidence.

---

**Created**: 2025-01-11
**Version**: 1.0
**Ecosystem**: Complete & Production-ready ✅
**Philosophy**: Self-organizing, context-aware, composable

---

## 📞 Quick Reference

**Starting a task?** → Use **master-orchestrator**
**Looking for something?** → Use **project-knowledge-base**
**Creating a scene?** → Use **telegram-scenes-ULTIMATE**
**Got an error?** → Use **error-recovery-debugging**
**Deploying?** → Use **production-deployment**

**Complex multi-system task?** → **master-orchestrator** coordinates everything automatically!
