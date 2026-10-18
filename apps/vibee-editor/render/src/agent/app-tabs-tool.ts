import * as SPEC from '../spec/app-tabs.gen'
import type { AgentTool } from './tools'

/**
 * EVERY TAB OF THE APP, AND THE TOOLS THAT SERVE IT HERE
 * (gHashTag/t27 specs/automation/app-tabs.t27, vendored in src/spec/).
 *
 * Owner, 2026-10-18 (translated): connect the CRM, the kanban and every other
 * tab into the one TRI CLAW MCP. The map is the spec's; this tool only reads it
 * out, joining each tool name to whether this registry serves it now. A tool
 * the spec names that is not registered is reported, never dropped, and a
 * tab's gaps (REST routes no tool serves yet) come with it. The t27_* tools in
 * the map are shown to the owner's scope only (service.t27 t27_visible).
 *
 * `has` is the registry's own lookup, passed in so this file does not import
 * the registry that imports it.
 */
export function makeAppTabsTool(has: (name: string) => boolean): AgentTool {
  return {
    name: SPEC.TOOL,
    description:
      'Map of the app: every tab (Hive, Tasks/kanban, Map, Factory, Tech Tree, Feed, Agents, Browser, AI, ' +
      'Profile, Keys & XP, CRM), its route, the tools on this endpoint that serve it (each labelled exact ' +
      'or suggested), and the routes no tool serves yet. Optional `tab` narrows to one. Sends nothing.',
    parameters: {
      type: 'object',
      properties: {
        tab: { type: 'string', enum: [...SPEC.TAB_KEYS] },
      },
      additionalProperties: false,
    },
    async handler(args) {
      const tabs = SPEC.TAB_KEYS.map((key, i) => ({
        key,
        route: SPEC.TAB_ROUTES[i],
        tools: SPEC.LINK_TOOL.flatMap((name, l) =>
          SPEC.LINK_TAB[l] === i
            ? [{ name, label: SPEC.LABEL_NAMES[SPEC.LINK_LABEL[l]], registered: has(name) }]
            : []
        ),
        gaps: SPEC.GAP_ROUTE.flatMap((route, g) =>
          SPEC.GAP_TAB[g] === i ? [{ route, label: SPEC.LABEL_NAMES[SPEC.GAP_LABEL[g]] }] : []
        ),
      }))
      const wanted = typeof args.tab === 'string' ? args.tab : null
      return {
        door: SPEC.DOOR,
        spec: `specs/${SPEC.KIND}/${SPEC.ID}.t27 v${SPEC.VERSION}`,
        tabs: wanted ? tabs.filter(t => t.key === wanted) : tabs,
        unmapped: [...SPEC.UNMAPPED_VIEWS],
      }
    },
  }
}
