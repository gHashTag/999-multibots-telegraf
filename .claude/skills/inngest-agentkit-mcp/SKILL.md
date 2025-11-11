---
name: inngest-agentkit-mcp
description: Inngest AgentKit with MCP (Model Context Protocol) integration for building multi-agent networks, event-driven AI workflows, and accessing 2000+ pre-built tools
version: 1.0.0
priority: HIGH
created: 2025-01-11
---

# 🤖 Inngest AgentKit + MCP - AI Agent Orchestration

> *"संयुक्तम् एव शक्तिः"* (Samyuktam Eva Shaktih)
>
> *"In unity there is strength."* - Collective intelligence amplifies capabilities.
>
> **Мудрость**: Multi-agent networks working together achieve what single agents cannot.

**The Agent Network Builder** - Create scalable AI agent networks with TypeScript, leveraging Inngest's durable execution and MCP's 2000+ tools.

---

## 🎯 Purpose

**inngest-agentkit-mcp** enables:
- 🤖 Multi-agent network orchestration
- 🔧 Access to 2000+ MCP tools (via Smithery registry)
- ⚡ Event-driven agent workflows
- 🔄 Durable execution with automatic retries
- 🎭 Dynamic routing between agents
- 📊 Built-in observability and tracing
- 🌐 Integration with OpenAI, Anthropic, Gemini

**Why Critical**: Combines Inngest's reliability with AgentKit's flexibility and MCP's vast tool ecosystem.

---

## 🏗️ Architecture Overview

### Three-Layer Architecture

```
┌─────────────────────────────────────────────────┐
│         MCP Tools (2000+ via Smithery)          │
│   Database | Browser | File | API | Search     │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│           AgentKit Network Layer                │
│  Agents | Routers | State | Tools | Streaming  │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│        Inngest Durable Execution Engine         │
│   Events | Steps | Retries | Webhooks | Cron   │
└─────────────────────────────────────────────────┘
```

**Flow**:
1. Event triggers Inngest function
2. Function creates AgentKit network
3. Agents use MCP tools for tasks
4. Results streamed back via Inngest steps
5. Checkpoints ensure durability

---

## 📚 Core Concepts

### 1. AgentKit Agents

**Agent** = Specialized AI with tools and persona.

```typescript
import { createAgent } from '@inngest/agent-kit'

const dataAnalystAgent = createAgent({
  name: "data-analyst",
  description: "Analyzes user data and generates insights",
  system: `You are a data analyst expert.
    - Analyze CSV data
    - Generate visualizations
    - Provide actionable insights
    - Always cite sources`,
  model: "claude-sonnet-4", // or gpt-4, gemini-pro
  tools: [
    // Built-in or custom tools
  ]
})
```

**Key Properties**:
- `name`: Unique identifier
- `system`: Agent persona and instructions
- `model`: LLM to use (OpenAI/Anthropic/Gemini)
- `tools`: Available functions/MCP servers

---

### 2. AgentKit Networks

**Network** = Multiple agents working together.

```typescript
import { createNetwork } from '@inngest/agent-kit'

const supportNetwork = createNetwork({
  agents: [
    triageAgent,        // Routes inquiries
    technicalAgent,     // Handles technical issues
    billingAgent,       // Handles payments
    escalationAgent     // Escalates complex cases
  ],
  defaultModel: "claude-sonnet-4",
  defaultRouter: async ({ state, history }) => {
    // Determine which agent should handle next
    const lastMessage = history[history.length - 1]

    if (lastMessage.content.includes('payment')) {
      return 'billing-agent'
    }

    if (lastMessage.content.includes('bug')) {
      return 'technical-agent'
    }

    return 'triage-agent'
  }
})
```

**Routing Strategies**:
1. **Code-based routing** (most deterministic)
2. **LLM-based routing** (flexible but less predictable)
3. **Hybrid routing** (combine both)

---

### 3. MCP Tools Integration

**MCP** = Model Context Protocol for tool access.

```typescript
import { createAgent } from '@inngest/agent-kit'

const databaseAgent = createAgent({
  name: "database-manager",
  system: "You manage Neon databases",
  mcpServers: [
    {
      name: "neon",
      transport: {
        type: "ws",  // or "sse", "http"
        url: "ws://localhost:8080"
      }
    },
    {
      name: "postgres-tools",
      transport: {
        type: "sse",
        url: "http://localhost:3000/mcp"
      }
    }
  ]
})
```

**Available Transports**:
- `ws` (WebSocket): Real-time, bidirectional
- `sse` (Server-Sent Events): Streaming from server
- `http`: Standard REST requests

**Tool Discovery**:
- MCP servers automatically expose their tools
- Tools are namespaced (`neon:create_database`)
- AgentKit fetches tool schemas dynamically

---

### 4. Inngest Integration (Durable Execution)

**Combine AgentKit with Inngest for reliability**:

```typescript
import { inngest } from '@/inngest_app/client'
import { createNetwork } from '@inngest/agent-kit'

export const aiWorkflowFunction = inngest.createFunction(
  {
    id: 'ai-workflow-agent-network',
    name: 'AI Workflow Agent Network',
    retries: 3
  },
  { event: 'ai/workflow.start' },
  async ({ event, step }) => {

    // Step 1: Initialize agent network (checkpoint)
    const network = await step.run('init-network', async () => {
      return createNetwork({
        agents: [researchAgent, writerAgent, editorAgent],
        defaultModel: "claude-sonnet-4"
      })
    })

    // Step 2: Research phase (checkpoint)
    const research = await step.run('research-phase', async () => {
      return await network.run({
        prompt: event.data.topic,
        agent: 'research-agent',
        maxIterations: 5
      })
    })

    // Step 3: Writing phase (checkpoint)
    const draft = await step.run('writing-phase', async () => {
      return await network.run({
        prompt: `Write article about: ${research.result}`,
        agent: 'writer-agent',
        context: research.state
      })
    })

    // Step 4: Editing phase (checkpoint)
    const final = await step.run('editing-phase', async () => {
      return await network.run({
        prompt: `Edit and improve: ${draft.result}`,
        agent: 'editor-agent'
      })
    })

    // Step 5: Notify user (checkpoint)
    await step.run('notify-telegram', async () => {
      await sendTelegramMessage(event.data.telegram_id, final.result)
    })

    return { success: true, articleId: final.id }
  }
)
```

**Benefits of Inngest + AgentKit**:
- ✅ Checkpoints at each step
- ✅ Automatic retries if agent fails
- ✅ Resume from last checkpoint (no duplicate work)
- ✅ Built-in observability
- ✅ Event-driven triggers

---

## 🎯 Success Patterns (Best Practices 2025)

### Pattern 1: Single-Purpose Agents with Clear Roles

```typescript
// ✅ GOOD - Clear, focused responsibility
const translatorAgent = createAgent({
  name: "translator",
  system: `You translate text between languages.
    - Always preserve meaning and tone
    - Provide context when ambiguous
    - Only translate, don't answer questions`,
  tools: [languageDetectionTool, translationTool]
})

// ❌ BAD - Too many responsibilities
const superAgent = createAgent({
  name: "do-everything",
  system: "You can translate, analyze, write code, and manage databases",
  // Confusing! Agent won't know what to do
})
```

**Why**: Focused agents make better decisions and are easier to debug.

---

### Pattern 2: Code-Based Routing (Most Deterministic)

```typescript
// ✅ GOOD - Deterministic routing logic
const router = async ({ state, history }) => {
  const lastMessage = history[history.length - 1].content.toLowerCase()

  // Clear rules
  if (lastMessage.includes('payment') || lastMessage.includes('billing')) {
    return 'billing-agent'
  }

  if (lastMessage.includes('bug') || lastMessage.includes('error')) {
    return 'technical-agent'
  }

  if (state.escalationCount > 2) {
    return 'human-escalation-agent'
  }

  return 'triage-agent'
}

// ❌ BAD - LLM-based routing (non-deterministic)
const llmRouter = async ({ history }) => {
  // Asks LLM to decide - unpredictable!
  const decision = await askGPT("Which agent should handle this?")
  return decision.agent
}
```

**Why**: Code-based routing gives complete control and predictability.

---

### Pattern 3: Shared Network State for Collaboration

```typescript
// ✅ GOOD - Agents share context via state
const network = createNetwork({
  agents: [researchAgent, writerAgent],
  initialState: {
    topic: '',
    research: [],
    sources: [],
    draftCount: 0
  }
})

// Research agent populates state
await network.run({
  agent: 'research-agent',
  prompt: 'Research AI trends',
  onStateUpdate: (state) => {
    state.research.push(newFinding)
    state.sources.push(source)
  }
})

// Writer agent uses research from state
await network.run({
  agent: 'writer-agent',
  context: network.state.research,  // ← Uses research!
  prompt: 'Write article'
})
```

**Why**: Shared state enables true collaboration between agents.

---

### Pattern 4: MCP Tools for Specialized Tasks

```typescript
// ✅ GOOD - Use MCP tools for complex operations
const devAgent = createAgent({
  name: "dev-assistant",
  system: "You help with development tasks",
  mcpServers: [
    {
      name: "github",
      transport: { type: "sse", url: "http://localhost:3000/mcp/github" }
    },
    {
      name: "database",
      transport: { type: "ws", url: "ws://localhost:8080" }
    }
  ]
})

// Agent can now use:
// - github:create_pr
// - github:review_code
// - database:query
// - database:migrate
// ...2000+ other tools via Smithery!
```

**Why**: MCP gives instant access to vast tool ecosystem without writing custom integrations.

---

### Pattern 5: Event-Driven Long-Running Workflows

```typescript
// ✅ GOOD - Offload long tasks to Inngest
export const videoGenerationWorkflow = inngest.createFunction(
  { id: 'video-gen-network', retries: 3 },
  { event: 'video/generation.start' },
  async ({ event, step }) => {

    // Step 1: Plan (fast)
    const plan = await step.run('planning-agent', async () => {
      return await plannerAgent.run({
        prompt: `Plan video for: ${event.data.prompt}`
      })
    })

    // Step 2: Generate script (moderate)
    const script = await step.run('script-agent', async () => {
      return await scriptAgent.run({
        prompt: plan.result,
        context: { style: event.data.style }
      })
    })

    // Step 3: Generate video (SLOW - 1-2 hours!)
    const video = await step.run('video-agent', async () => {
      // Uses MCP tools for Replicate/Fal.ai
      return await videoAgent.run({
        prompt: script.result,
        tools: ['replicate:generate_video']
      })
    })

    // Step 4: Post-process (moderate)
    const final = await step.run('editor-agent', async () => {
      return await editorAgent.run({
        video: video.url,
        tools: ['ffmpeg:add_music', 'ffmpeg:add_subtitles']
      })
    })

    return { videoUrl: final.url }
  }
)
```

**Why**: Inngest handles crashes, retries, and long execution seamlessly.

---

### Pattern 6: Instrumentation and Logging

```typescript
// ✅ GOOD - Log everything for debugging
const agent = createAgent({
  name: "instrumented-agent",
  system: "You solve problems",
  tools: [problemSolver],
  onToolCall: (tool, args) => {
    console.log(`[TOOL CALL] ${tool.name}`, args)
    // Track to observability platform
    trackEvent('agent.tool_call', { tool: tool.name, args })
  },
  onToolResult: (tool, result) => {
    console.log(`[TOOL RESULT] ${tool.name}`, result)
    trackEvent('agent.tool_result', { tool: tool.name, success: !!result })
  },
  onError: (error) => {
    console.error(`[AGENT ERROR]`, error)
    trackEvent('agent.error', { error: error.message })
  }
})
```

**Why**: You can't optimize what you don't measure. Track everything!

---

## 🛠️ Setup & Configuration

### 1. Install Dependencies

```bash
npm install inngest @inngest/agent-kit

# For MCP support
npm install @modelcontextprotocol/sdk

# For specific model providers
npm install openai @anthropic-ai/sdk @google/generative-ai
```

### 2. Configure Inngest Client

```typescript
// src/inngest_app/agentkit-client.ts
import { Inngest } from 'inngest'

export const inngest = new Inngest({
  id: 'vibee-bot-agentkit',
  name: 'VIBEE AgentKit',
  eventKey: process.env.INNGEST_EVENT_KEY,
  baseUrl: process.env.INNGEST_BASE_URL
})
```

### 3. Create Agent Network

```typescript
// src/inngest_app/agents/support-network.ts
import { createAgent, createNetwork } from '@inngest/agent-kit'

const triageAgent = createAgent({
  name: "triage",
  system: "You categorize user inquiries",
  model: "claude-sonnet-4"
})

const technicalAgent = createAgent({
  name: "technical",
  system: "You solve technical problems",
  model: "gpt-4-turbo",
  mcpServers: [
    {
      name: "github",
      transport: {
        type: "sse",
        url: process.env.GITHUB_MCP_URL
      }
    }
  ]
})

export const supportNetwork = createNetwork({
  agents: [triageAgent, technicalAgent],
  defaultModel: "claude-sonnet-4"
})
```

### 4. Create Inngest Function

```typescript
// src/inngest_app/functions/agentkit/supportAgentFunction.ts
import { inngest } from '@/inngest_app/agentkit-client'
import { supportNetwork } from '@/inngest_app/agents/support-network'

export const supportAgentFunction = inngest.createFunction(
  {
    id: 'support-agent-network',
    name: 'Support Agent Network',
    retries: 2
  },
  { event: 'support/ticket.created' },
  async ({ event, step }) => {

    const response = await step.run('process-ticket', async () => {
      return await supportNetwork.run({
        prompt: event.data.message,
        agent: 'triage',  // Start with triage
        maxIterations: 10,
        state: {
          ticketId: event.data.ticketId,
          userId: event.data.userId
        }
      })
    })

    await step.run('notify-user', async () => {
      await sendTelegramMessage(event.data.userId, response.result)
    })

    return { handled: true, response: response.result }
  }
)
```

### 5. Register Function

```typescript
// src/inngest_app/registerFunctions.ts
import { serve } from 'inngest/next'
import { inngest } from './agentkit-client'
import { supportAgentFunction } from './functions/agentkit/supportAgentFunction'

export default serve({
  client: inngest,
  functions: [
    supportAgentFunction,
    // ... other functions
  ]
})
```

---

## 🎭 Real-World Use Cases

### Use Case 1: AI Content Generation Pipeline

**Problem**: Need to research topic, write article, edit, and publish.

```typescript
const contentPipeline = createNetwork({
  agents: [
    createAgent({
      name: "researcher",
      system: "Research topics thoroughly",
      mcpServers: [
        { name: "google-search", transport: { type: "sse", url: "..." } },
        { name: "wikipedia", transport: { type: "http", url: "..." } }
      ]
    }),
    createAgent({
      name: "writer",
      system: "Write engaging articles"
    }),
    createAgent({
      name: "editor",
      system: "Edit for clarity and grammar"
    })
  ],
  defaultModel: "claude-sonnet-4"
})

inngest.createFunction(
  { id: 'content-pipeline' },
  { event: 'content/generate.start' },
  async ({ event, step }) => {
    const research = await step.run('research', async () => {
      return await contentPipeline.run({
        agent: 'researcher',
        prompt: event.data.topic
      })
    })

    const draft = await step.run('write', async () => {
      return await contentPipeline.run({
        agent: 'writer',
        context: research.state,
        prompt: 'Write article'
      })
    })

    const final = await step.run('edit', async () => {
      return await contentPipeline.run({
        agent: 'editor',
        prompt: `Edit: ${draft.result}`
      })
    })

    return { article: final.result }
  }
)
```

---

### Use Case 2: Database Management Agent

**Problem**: Users need to manage databases via natural language.

```typescript
const dbAgent = createAgent({
  name: "database-manager",
  system: `You manage PostgreSQL databases.
    - Create tables based on requirements
    - Run queries safely
    - Explain query results
    - Never drop production data without confirmation`,
  mcpServers: [
    {
      name: "neon",
      transport: {
        type: "ws",
        url: process.env.NEON_MCP_URL
      }
    }
  ],
  model: "claude-sonnet-4"
})

inngest.createFunction(
  { id: 'db-agent' },
  { event: 'database/query.request' },
  async ({ event, step }) => {
    const result = await step.run('execute-query', async () => {
      return await dbAgent.run({
        prompt: event.data.naturalLanguageQuery,
        tools: ['neon:query', 'neon:create_table', 'neon:list_tables']
      })
    })

    return { sql: result.sqlGenerated, result: result.queryResult }
  }
)
```

---

### Use Case 3: Code Review Agent

**Problem**: Automate PR reviews with AI.

```typescript
const codeReviewAgent = createAgent({
  name: "code-reviewer",
  system: `You review code for:
    - Security vulnerabilities
    - Performance issues
    - Best practices
    - TypeScript errors
    Always provide specific line numbers and suggestions.`,
  mcpServers: [
    {
      name: "github",
      transport: { type: "sse", url: process.env.GITHUB_MCP_URL }
    }
  ],
  model: "gpt-4-turbo"
})

inngest.createFunction(
  { id: 'code-review-agent' },
  { event: 'github/pr.opened' },
  async ({ event, step }) => {
    const diff = await step.run('get-diff', async () => {
      return await codeReviewAgent.run({
        tools: ['github:get_pr_diff'],
        prompt: `Get diff for PR #${event.data.prNumber}`
      })
    })

    const review = await step.run('review-code', async () => {
      return await codeReviewAgent.run({
        prompt: `Review this code:\n${diff.result}`,
        context: { prNumber: event.data.prNumber }
      })
    })

    await step.run('post-review', async () => {
      return await codeReviewAgent.run({
        tools: ['github:create_review'],
        prompt: `Post review: ${review.result}`
      })
    })

    return { reviewed: true }
  }
)
```

---

## 📊 Integration with Existing Project

### Current Inngest Setup

**Existing**:
```typescript
// src/inngest_app/client.ts
export const inngest = new Inngest({
  id: 'vibee-bot-client',
  name: 'Vibee',
  baseUrl: 'https://three-head-dragon.shop/api/inngest',
  eventKey: process.env.BOT_INNGEST_EVENT_KEY
})
```

**Add AgentKit Support**:
```typescript
// src/inngest_app/agentkit-client.ts (NEW FILE)
import { Inngest } from 'inngest'

export const agentkitInngest = new Inngest({
  id: 'vibee-agentkit',
  name: 'Vibee AgentKit',
  baseUrl: 'https://three-head-dragon.shop/api/inngest',
  eventKey: process.env.BOT_INNGEST_EVENT_KEY
})
```

### Existing Inngest Functions

**Pattern to Follow**:
```typescript
// src/inngest_app/functions/existing/generateModelTrainingFunction.ts
export const generateModelTrainingFunction = inngest.createFunction(...)

// NEW: AgentKit equivalent
// src/inngest_app/functions/agentkit/videoGenerationAgentFunction.ts
export const videoGenerationAgentFunction = agentkitInngest.createFunction(
  { id: 'video-gen-agent' },
  { event: 'video/generation.start' },
  async ({ event, step }) => {
    // Use AgentKit network instead of direct API calls
    const network = createNetwork({ agents: [plannerAgent, generatorAgent] })

    return await step.run('generate-video', async () => {
      return await network.run({
        prompt: event.data.prompt,
        agent: 'generator'
      })
    })
  }
)
```

---

## 🚨 Anti-Patterns (Avoid These!)

### Anti-Pattern #1: Too Many Agents in Network

```typescript
// ❌ BAD - 20 agents = confusion
const network = createNetwork({
  agents: [
    agent1, agent2, agent3, agent4, agent5,
    agent6, agent7, agent8, agent9, agent10,
    agent11, agent12, agent13, agent14, agent15,
    agent16, agent17, agent18, agent19, agent20
  ]
})

// ✅ GOOD - 3-5 focused agents
const network = createNetwork({
  agents: [triageAgent, technicalAgent, escalationAgent]
})
```

**Rule**: Max 5-7 agents per network. Create separate networks for different domains.

---

### Anti-Pattern #2: Not Using Inngest Steps

```typescript
// ❌ BAD - No checkpoints, everything re-runs on failure
inngest.createFunction(
  { id: 'bad-function' },
  { event: 'process.start' },
  async ({ event }) => {
    const result1 = await longOperation1()  // If this fails here...
    const result2 = await longOperation2()  // ...this re-runs from start!
    return result2
  }
)

// ✅ GOOD - Checkpoints at each step
inngest.createFunction(
  { id: 'good-function' },
  { event: 'process.start' },
  async ({ event, step }) => {
    const result1 = await step.run('step-1', async () => {
      return await longOperation1()  // Checkpointed!
    })

    const result2 = await step.run('step-2', async () => {
      return await longOperation2()  // Only this re-runs if failed
    })

    return result2
  }
)
```

---

### Anti-Pattern #3: Blocking on Agent Responses

```typescript
// ❌ BAD - Synchronous waiting in Telegram bot
bot.on('text', async (ctx) => {
  const response = await agent.run({ prompt: ctx.message.text })
  // User waits 30+ seconds... bad UX!
  await ctx.reply(response.result)
})

// ✅ GOOD - Async via Inngest
bot.on('text', async (ctx) => {
  await ctx.reply('⏳ Processing...')

  await inngest.send({
    name: 'agent/query.start',
    data: {
      telegramId: ctx.from.id,
      prompt: ctx.message.text
    }
  })

  // Agent processes in background, notifies user when done
})
```

---

## 🕉️ Philosophical Principles

### Multi-Agent Philosophy

> *"यथा पिण्डे तथा ब्रह्माण्डे"* (Yatha Pinde Tatha Brahmande)
>
> *"As is the atom, so is the universe."*

**Application**: Each agent is specialized (atom), but together they form intelligent system (universe).

### Deterministic Routing

> *"कर्म प्रधानं"* (Karma Pradhanam)
>
> *"Action is primary."*

**Application**: Code-based routing (explicit actions) beats LLM-based routing (uncertain decisions).

### Durability via Checkpoints

> *"संचित कर्म"* (Sanchita Karma)
>
> *"Accumulated actions."*

**Application**: Inngest checkpoints accumulate progress, never losing work done.

---

## 📈 Success Metrics

**KPIs**:
- Agent task completion rate: **Target > 90%**
- Average routing decisions per query: **Target < 5** (fewer = more deterministic)
- MCP tool usage: **Track which tools used most**
- Inngest retry rate: **Target < 10%** (lower = more reliable)
- User satisfaction: **Target > 85%**

---

## 🔗 Related Skills & Agents

**Skills**:
- inngest-expert - Base Inngest patterns
- ai-pipeline-orchestration - AI provider patterns
- telegram-scenes-ULTIMATE - Bot UX patterns

**Agents**:
- inngest-function-builder - Builds Inngest functions (NEW!)
- best-practices-researcher - Researches patterns

**Tools**:
- MCP Servers (2000+ via Smithery)
- Inngest Dashboard (observability)

---

## 📚 Resources

**Documentation**:
- AgentKit Docs: https://agentkit.inngest.com/
- MCP Spec: https://modelcontextprotocol.io/
- Smithery Registry: https://smithery.ai/
- Inngest Docs: https://www.inngest.com/docs

**Examples**:
- Cursor Agent Mode: https://www.inngest.com/blog/cursor-agentkit-e2b
- Multi-agent Networks: https://agentkit.inngest.com/guides/networks

---

**Created**: 2025-01-11
**Version**: 1.0.0
**Priority**: 🟡 HIGH
**Status**: Production Ready ✅

---

## 🕉️ Closing Wisdom

> *"सह नाववतु। सह नौ भुनक्तु।"* (Saha Navavatu. Saha Nau Bhunaktu.)
>
> *"May we be protected together. May we be nourished together."*

**Мудрость для multi-agent систем**: Agents protect and nourish each other through collaboration. Together they achieve what none can alone.

**Да будут агенты работать в гармонии! Multi-agent intelligence = amplified power.** 🤖✨
