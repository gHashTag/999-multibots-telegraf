// reels MCP server V1 -- thin glue over compiled .t27 gate logic.
// Laws: every decision comes from src/spec/*.logic.ts (wasm built from
// ~/t27/specs/port/reels/*.t27); no threshold or rule lives in this file.
// Publish stays BLOCKED in V1: owner approval required, no external API keys.
//
// Low-level Server API (same pattern as src/inngest_app/mcp-server.ts).
// The high-level McpServer.registerTool generics exploded TS2589 in this
// checkout (zod/v3 + zod/v4 dual-union in the SDK's ToolCallback types);
// the low-level Server + hand-written JSON Schema has no such generics.
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
  type ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js'
import * as BRIEF from '../spec/reels-brief.gen'
import * as briefLogic from '../spec/reels-brief.logic'
import * as confirmLogic from '../spec/confirm-gate.logic'
import * as dryRunLogic from '../spec/dry-run-gate.logic'
import * as breakerLogic from '../spec/circuit-breaker.logic'
import * as apiKeyLogic from '../spec/api-key-gate.logic'
import * as termsLogic from '../spec/forbidden-terms.logic'
import * as BREAKER from '../spec/circuit-breaker.gen'
import * as KEY from '../spec/api-key-gate.gen'
import * as PUBLISH from '../spec/publish-gate.gen'
import * as publishLogic from '../spec/publish-gate.logic'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Beat = { index: number; role: 'hook' | 'body' | 'cta' }
type Brief = {
  topic: string
  seconds: number
  scenes: number
  perSceneMs: number
  totalMs: number
  beats: Beat[]
}
type Storyboard = {
  briefId: string
  topic: string
  totalMs: number
  scenes: {
    index: number
    role: Beat['role']
    ms: number
    visualPrompt: string
  }[]
}
type Render = {
  storyboardId: string
  executed: boolean
  manifestPath?: string
}

type ToolResult = {
  content: { type: 'text'; text: string }[]
  isError: boolean
}

const text = (value: unknown, isError = false): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  isError,
})

// Transport-level argument shape checks: plumbing only, no rule numbers here.
const argString = (
  args: Record<string, unknown>,
  key: string
): string | undefined => {
  const value = args[key]
  return typeof value === 'string' ? value : undefined
}
const argBool = (
  args: Record<string, unknown>,
  key: string
): boolean | undefined => {
  const value = args[key]
  return typeof value === 'boolean' ? value : undefined
}

const readOnly: ToolAnnotations = { readOnlyHint: true, openWorldHint: false }
const writing: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
}

export function createReelsServer(): Server {
  const server = new Server(
    { name: 'reels-mcp', version: '1.0.0' },
    {
      capabilities: { tools: {} },
    }
  )
  const briefs = new Map<string, Brief>()
  const storyboards = new Map<string, Storyboard>()
  const renders = new Map<string, Render>()
  let seq = 0
  // Circuit-breaker state, decisions from circuit-breaker.logic.
  let breakerState = BREAKER.STATE_CLOSED
  let breakerFailures = 0
  let breakerOpenedAt = 0

  // Transport gate. stdio on the owner's machine is the exempt path
  // (api-key-gate.t27 path_exempt); an HTTP front would pass pathExempt=false.
  const pathExempt = true
  const keyConfigured =
    process.env[KEY.API_KEY_ENV_NAME] !== undefined &&
    process.env[KEY.API_KEY_ENV_NAME] !== ''

  const gateRequest = (apiKeyGiven?: string): string | null => {
    if (apiKeyLogic.allows(keyConfigured, apiKeyGiven ?? '', pathExempt)) {
      return null
    }
    return `rejected by api-key-gate.t27: provide a key with the ${KEY.KEY_PREFIX} prefix (${KEY.MIN_KEY_LEN}..${KEY.MAX_KEY_LEN} chars)`
  }

  const openMs = () => Date.now() - breakerOpenedAt

  // Refuse while the breaker is open; a cooled-down breaker admits one probe
  // and next_state closes or re-opens it from that probe's outcome.
  const breakerRefusal = (): string | null => {
    if (breakerState === BREAKER.STATE_CLOSED) return null
    const waitedMs = openMs()
    if (!breakerLogic.canProbe(waitedMs)) {
      return `circuit breaker is open: retry in ${breakerLogic.retryAfter(waitedMs)} ms`
    }
    return null
  }

  const breakerAfter = (success: boolean) => {
    // t27-plumbing: the clock sample is transport shape; the count fed to
    // next_state includes the failure being reported, exactly as opens() reads it.
    const failures = success ? 0 : breakerFailures + 1
    const waitedMs = breakerState === BREAKER.STATE_OPEN ? openMs() : 0
    const next = breakerLogic.nextState(
      breakerState,
      success,
      failures,
      waitedMs
    )
    if (next === BREAKER.STATE_OPEN && breakerState !== BREAKER.STATE_OPEN) {
      breakerOpenedAt = Date.now()
    }
    breakerState = next
    breakerFailures = failures
  }

  const reelsBrief = (args: Record<string, unknown>): ToolResult => {
    const gate = gateRequest()
    if (gate) return text({ rejected: gate }, true)
    // t27-plumbing: transport input shape only; the window itself is the spec's.
    const topic = argString(args, 'topic')
    if (topic === undefined || topic === '' || topic.length > 500) {
      return text(
        {
          rejected:
            'topic must be a non-empty string of at most 500 characters',
        },
        true
      )
    }
    const secondsValue = args['seconds']
    if (typeof secondsValue !== 'number') {
      // t27-plumbing: transport input shape only; the window itself is the spec's.
      return text(
        {
          rejected: `seconds is required and must be an integer in ${BRIEF.SECONDS_MIN}..${BRIEF.SECONDS_MAX}`,
        },
        true
      )
    }
    const seconds = secondsValue
    if (!briefLogic.secondsOk(seconds)) {
      return text(
        {
          rejected: `seconds must be ${BRIEF.SECONDS_MIN}..${BRIEF.SECONDS_MAX}`,
        },
        true
      )
    }
    if (!termsLogic.chapterIsClean(topic)) {
      return text(
        {
          rejected:
            'topic fails the forbidden-terms audit (specs/port/reels/forbidden-terms.t27); rephrase without audit terms',
        },
        true
      )
    }
    const scenes = briefLogic.sceneCount(seconds)
    const perSceneMs = briefLogic.perSceneMs(seconds, scenes)
    const totalMs = seconds * BRIEF.MS_PER_SECOND
    const beats: Beat[] = []
    for (let i = 0; i < scenes; i += 1) {
      beats.push({
        index: i,
        role: i === 0 ? 'hook' : i === scenes - 1 ? 'cta' : 'body',
      })
    }
    const briefId = `brief_${++seq}`
    briefs.set(briefId, { topic, seconds, scenes, perSceneMs, totalMs, beats })
    return text({
      brief_id: briefId,
      topic,
      seconds,
      scenes,
      per_scene_ms: perSceneMs,
      total_ms: totalMs,
      duration_ok: briefLogic.durationOk(totalMs),
      beats,
      spec: `${BRIEF.ID} v${BRIEF.VERSION}`,
    })
  }

  const reelsStoryboard = (args: Record<string, unknown>): ToolResult => {
    const gate = gateRequest()
    if (gate) return text({ rejected: gate }, true)
    const brief_id = argString(args, 'brief_id') ?? ''
    const brief = briefs.get(brief_id)
    if (!brief) {
      return text(
        { rejected: `unknown brief_id ${brief_id}; call reels_brief first` },
        true
      )
    }
    if (!briefLogic.durationOk(brief.totalMs)) {
      return text(
        {
          rejected:
            'brief total_ms fails the duration window; build a new brief',
        },
        true
      )
    }
    const scenes = brief.beats.map(beat => ({
      index: beat.index,
      role: beat.role,
      ms: brief.perSceneMs,
      visualPrompt: `static frame for the ${beat.role} of a reel about: ${brief.topic}`,
    }))
    const storyboardId = `storyboard_${++seq}`
    storyboards.set(storyboardId, {
      briefId: brief_id,
      topic: brief.topic,
      totalMs: brief.totalMs,
      scenes,
    })
    return text({
      storyboard_id: storyboardId,
      brief_id,
      scene_count: scenes.length,
      total_ms: brief.totalMs,
      scenes,
      spec: `${BRIEF.ID} v${BRIEF.VERSION}`,
    })
  }

  const reelsAssets = (args: Record<string, unknown>): ToolResult => {
    const gate = gateRequest()
    if (gate) return text({ rejected: gate }, true)
    const storyboard_id = argString(args, 'storyboard_id') ?? ''
    const storyboard = storyboards.get(storyboard_id)
    if (!storyboard) {
      return text(
        {
          rejected: `unknown storyboard_id ${storyboard_id}; call reels_storyboard first`,
        },
        true
      )
    }
    return text({
      storyboard_id,
      assets: storyboard.scenes.map(scene => ({
        scene: scene.index,
        status: 'placeholder-v1',
        image_prompt: scene.visualPrompt,
        voice_script: `${scene.role} line for: ${storyboard.topic}`,
        ms: scene.ms,
      })),
      note: 'V1 has no external API keys; real image and voice generation needs a provider GO from the owner',
    })
  }

  const reelsRender = async (
    args: Record<string, unknown>
  ): Promise<ToolResult> => {
    const gate = gateRequest()
    if (gate) return text({ rejected: gate }, true)
    const storyboard_id = argString(args, 'storyboard_id') ?? ''
    const storyboard = storyboards.get(storyboard_id)
    if (!storyboard) {
      return text(
        {
          rejected: `unknown storyboard_id ${storyboard_id}; call reels_storyboard first`,
        },
        true
      )
    }
    if (!briefLogic.durationOk(storyboard.totalMs)) {
      return text(
        { rejected: 'storyboard total_ms fails the duration window' },
        true
      )
    }
    const dry_run = argBool(args, 'dry_run')
    const confirm = argBool(args, 'confirm')
    const dryRunGiven = dry_run !== undefined
    const dryRun = dryRunLogic.effectiveDryRun(dryRunGiven, dry_run === true)
    const confirmPresent = confirm !== undefined
    const runDir =
      process.env.REELS_RUN_DIR ?? join(tmpdir(), 'reels-mcp-v1-runs')
    const manifestPath = join(runDir, `manifest-${storyboard_id}.json`)
    if (!dryRunLogic.mayExecute(dryRun, confirmPresent)) {
      return text({
        dry_run: true,
        would_write: manifestPath,
        scene_count: storyboard.scenes.length,
        total_ms: storyboard.totalMs,
        reason: 'pass dry_run=false together with confirm to execute the write',
      })
    }
    const refusal = breakerRefusal()
    if (refusal) return text({ rejected: refusal }, true)
    const manifest = {
      kind: BREAKER.KIND,
      spec: `${BRIEF.ID} v${BRIEF.VERSION}`,
      storyboard_id,
      brief_id: storyboard.briefId,
      topic: storyboard.topic,
      total_ms: storyboard.totalMs,
      render_kind: 'manifest-v1',
      scenes: storyboard.scenes,
    }
    let writeOk = false
    try {
      await mkdir(runDir, { recursive: true })
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
      writeOk = true
    } catch (error) {
      breakerAfter(false)
      return text({ error: `manifest write failed: ${String(error)}` }, true)
    }
    breakerAfter(writeOk)
    const renderId = `render_${++seq}`
    renders.set(renderId, {
      storyboardId: storyboard_id,
      executed: true,
      manifestPath,
    })
    return text({
      render_id: renderId,
      storyboard_id,
      manifest_path: manifestPath,
      executed: true,
      render_kind: 'manifest-v1',
      note: 'V1 writes the plan manifest; video encoding needs a provider GO from the owner',
    })
  }

  const reelsPublish = (args: Record<string, unknown>): ToolResult => {
    // V2 publish contour, spec port/reels/publish-gate.t27. The gate decision
    // comes from the spec's blockedStage; the glue only gathers the inputs:
    // an explicit GO arg pair, provider-key PRESENCE in the environment (the
    // value is never read, logged or echoed), the render record's executed
    // flag and an explicit confirm. Every missing piece answers a structured
    // blocked body; the happy path asserts the gating decision and takes NO
    // external action — a real publish needs a separate explicit owner GO.
    const goGiven = args['go'] !== undefined
    const goValue = argBool(args, 'go') === true
    const keyConfigured = Boolean(process.env[KEY.API_KEY_ENV_NAME])
    const render_id = argString(args, 'render_id') ?? ''
    const api_key = argString(args, 'api_key')
    const confirm = argBool(args, 'confirm')
    const gate = gateRequest(api_key)
    if (gate) return text({ rejected: gate }, true)
    const render = renders.get(render_id)
    const stage = publishLogic.blockedStage(
      goGiven,
      goValue,
      keyConfigured,
      render !== undefined,
      render !== undefined ? render.executed : false,
      confirm !== undefined,
      confirm === true
    )
    // t27-plumbing: stage-code → transport label map; the decision is the spec's.
    const stageLabels: Record<number, string> = {
      [PUBLISH.STAGE_PUBLISHABLE]: 'publishable',
      [PUBLISH.STAGE_OWNER_GO_REQUIRED]: 'owner-approval-required',
      [PUBLISH.STAGE_PROVIDER_KEY_MISSING]: 'provider-key-missing',
      [PUBLISH.STAGE_RENDER_NOT_EXECUTED]: 'render-not-executed',
      [PUBLISH.STAGE_CONFIRM_MISSING]: 'confirm-missing',
    }
    const specTag = `${BRIEF.ID} v${BRIEF.VERSION}`
    if (stage === PUBLISH.STAGE_PUBLISHABLE) {
      return text({
        blocked: false,
        stage,
        stage_name: stageLabels[stage],
        published: false,
        render_id,
        reason:
          'publish gate OPEN: GO, provider key, executed render and confirm are all present; ' +
          'V2 stops here — no external API is called and nothing was published',
        spec: specTag,
      })
    }
    const reasons: Record<number, string> = {
      [PUBLISH.STAGE_OWNER_GO_REQUIRED]:
        'publish is BLOCKED: owner GO flag absent or false; the gate needs "go": true',
      [PUBLISH.STAGE_PROVIDER_KEY_MISSING]: `publish is BLOCKED: provider key not configured; set ${KEY.API_KEY_ENV_NAME} in the environment`,
      [PUBLISH.STAGE_RENDER_NOT_EXECUTED]:
        'publish is BLOCKED: render not found or not executed; run reels_render with dry_run:false and confirm:true first',
      [PUBLISH.STAGE_CONFIRM_MISSING]:
        'publish is BLOCKED: confirm field absent or false; the gate needs "confirm": true',
    }
    return text({
      blocked: true,
      stage,
      stage_name: stageLabels[stage],
      published: false,
      render_id,
      reason:
        reasons[stage] ?? 'publish is BLOCKED: a required piece is missing',
      spec: specTag,
    })
  }

  const TOOLS: Tool[] = [
    {
      name: 'reels_brief',
      title: 'Reels brief',
      description:
        'Turn a topic into a reels brief: scene count, per-scene milliseconds and beat roles ' +
        'for a short-form reel. Numbers come from spec port/reels/reels-brief.t27: reels run ' +
        `5..60 seconds (spec: ${BRIEF.SECONDS_MIN}..${BRIEF.SECONDS_MAX}), one scene per ` +
        `${BRIEF.SECONDS_PER_SCENE} seconds, clamped to ${BRIEF.SCENE_MIN}..${BRIEF.SCENE_MAX} scenes. Read-only. Topics are ` +
        'audited against the forbidden-terms spec and refused without echoing the term. ' +
        'V1 is deterministic: no external API keys and no provider calls.',
      inputSchema: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'What the reel is about; 1..500 characters',
          },
          seconds: {
            type: 'integer',
            description: `Reel length in seconds, ${BRIEF.SECONDS_MIN}..${BRIEF.SECONDS_MAX}`,
          },
        },
        required: ['topic', 'seconds'],
      },
      annotations: readOnly,
    },
    {
      name: 'reels_storyboard',
      title: 'Reels storyboard',
      description:
        'Expand an existing brief into a storyboard: one visual prompt per scene with its ' +
        'duration in milliseconds. Read-only, deterministic, no provider calls in V1. ' +
        'Durations come from the brief produced by reels_brief; the total is re-checked ' +
        'against the duration window of spec port/reels/reels-brief.t27.',
      inputSchema: {
        type: 'object',
        properties: {
          brief_id: {
            type: 'string',
            description: 'brief_id returned by reels_brief',
          },
        },
        required: ['brief_id'],
      },
      annotations: readOnly,
    },
    {
      name: 'reels_assets',
      title: 'Reels assets',
      description:
        'List the asset placeholders a storyboard needs: one image prompt and one voiceover ' +
        'script per scene. V1 produces placeholders only -- no external API keys are configured ' +
        'and nothing is fetched or generated. Read-only.',
      inputSchema: {
        type: 'object',
        properties: {
          storyboard_id: {
            type: 'string',
            description: 'storyboard_id returned by reels_storyboard',
          },
        },
        required: ['storyboard_id'],
      },
      annotations: readOnly,
    },
    {
      name: 'reels_render',
      title: 'Reels render',
      description:
        'Write the render manifest for a storyboard under the local run directory. V1 renders ' +
        'the plan manifest only -- no video encoding and no provider calls. Dry-run by default: ' +
        'without dry_run=false and a confirm field the tool answers what it WOULD write and ' +
        'writes nothing. Gated by the circuit-breaker spec: after 3 consecutive failures the ' +
        'breaker opens for 10 seconds and refuses with a retry hint.',
      inputSchema: {
        type: 'object',
        properties: {
          storyboard_id: {
            type: 'string',
            description: 'storyboard_id returned by reels_storyboard',
          },
          dry_run: {
            type: 'boolean',
            description: 'absent means true: return the plan without writing',
          },
          confirm: {
            type: 'boolean',
            description: 'required together with dry_run=false to write',
          },
        },
        required: ['storyboard_id'],
      },
      annotations: writing,
    },
    {
      name: 'reels_publish',
      title: 'Reels publish',
      description:
        'Publish contour V2 (spec port/reels/publish-gate.t27), still fail-closed: the tool ' +
        'answers a gate decision and takes NO external action in V2 — a real publish needs a ' +
        'separate explicit owner GO. The gate needs ALL of: "go": true (owner GO flag), ' +
        `${KEY.API_KEY_ENV_NAME} present in the environment, a render_id from an EXECUTED ` +
        'reels_render call, and "confirm": true. The answer names the first missing piece ' +
        '(stage: owner GO first, then provider key, then render, then confirm); when every ' +
        'piece is present it reports the gate OPEN and still publishes nothing.',
      inputSchema: {
        type: 'object',
        properties: {
          render_id: {
            type: 'string',
            description: 'render_id returned by reels_render',
          },
          go: {
            type: 'boolean',
            description:
              'owner GO for this publish call; absent or false keeps the gate closed',
          },
          confirm: {
            type: 'boolean',
            description: 'absent means false: the gate answers confirm-missing',
          },
          api_key: {
            type: 'string',
            description: `${KEY.KEY_PREFIX}-prefixed key, needed only when the transport is not path-exempt`,
          },
        },
        required: ['render_id'],
      },
      annotations: writing,
    },
  ]

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }))

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const name = request.params.name
    const args = (request.params.arguments ?? {}) as Record<string, unknown>
    switch (name) {
      case 'reels_brief':
        return reelsBrief(args)
      case 'reels_storyboard':
        return reelsStoryboard(args)
      case 'reels_assets':
        return reelsAssets(args)
      case 'reels_render':
        return reelsRender(args)
      case 'reels_publish':
        return reelsPublish(args)
      default:
        return text({ error: `unknown tool ${name}` }, true)
    }
  })

  return server
}
