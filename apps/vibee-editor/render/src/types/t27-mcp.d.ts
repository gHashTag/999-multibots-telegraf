// The t27-mcp package ships plain ESM; these are the shapes src/agent/t27-tools.ts reads.
declare module 't27-mcp' {
  export const tools: ReadonlyArray<{
    name: string
    description: string
    inputSchema: Record<string, unknown>
  }>
  export function call(name: string, args: Record<string, unknown>): Promise<string>
}

declare module 't27-mcp/service' {
  export function admit(name: string, offeredBy: number): number
  export function homeOf(name: string): number
  export function localServes(name: string): boolean
  export function t27Visible(scope: number): boolean
  export const H_T27: number
  export const H_TRI_CLAW: number
  export const A_MOUNT: number
  export const A_DROP_FORWARDER: number
  export const A_REFUSE_COLLISION: number
  export const A_REFUSE_NAME: number
  export const ADMIT_TEXT: readonly string[]
  export const S_OWNER: number
  export const S_EDITORIAL: number
  export const S_GAME: number
  export const S_NONE: number
  export const CODER_TOOLS: readonly string[]
}

declare module 't27-mcp/visual' {
  export const ruleTriClaw: string
}
