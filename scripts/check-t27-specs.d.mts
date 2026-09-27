// Types for scripts/check-t27-specs.mjs, so a TypeScript test can import it.
export interface Problem {
  spec: string
  law: string
  what: string
}
export const ROOT: string
export const FOOTER: string
export const REPO: string
export function specConsts(text: string): Map<string, unknown>
export function specTests(
  text: string
): Array<{ title: string; line: number; braced: boolean; body: string }>
export function genModule(text: string): {
  header: string
  consts: Map<string, unknown>
  declOrder: string[] | null
  structOrder: string[] | null
  notEmitted: unknown[] | null
}
export function checkSpec(o: {
  file: string
  spec: string
  gen: string | null
  test: string | null
  hostFiles?: Array<{ path: string; text: string }>
  ignore?: string
}): Problem[]
export function readManifest(root?: string): {
  hosts: Array<{ root: string; specDir: string }>
  unbound: string[]
  foreign: string[]
  citedMissing: string[]
}
export function checkRepo(o?: {
  root?: string
  t27?: string | null
  run?: boolean
}): Problem[]
export function readTestReport(out: string): {
  tests: number | null
  fail: number | null
  failed: string[]
}
