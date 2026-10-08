/** Types of apps/vibee-editor/packages/test-guard/no-network.mjs: the network guard of every test suite. */

type Hook = (fn: () => void) => unknown

/** This machine: a test may serve and call itself. */
export function isLoopback(host: string): boolean
/** A name no public resolver answers: one label, or a reserved zone. */
export function neverResolves(host: string): boolean
/** The host a fetch was asked for: a string, a URL or a Request. */
export function hostOf(input: unknown): string
/** What was refused since the last check, emptied. */
export function drainReached(): string[]
/** Throws, naming every refused call since the last check. */
export function failIfReached(): void
/** Remove proxy variables (a loopback proxy is still the network); the names removed. */
export function dropProxyEnv(env?: Record<string, string | undefined>): string[]
/** Install the guard (once per process) and fail every test that reached the network. */
export function installNoNetwork(hooks: {
  afterEach: Hook
  afterAll: Hook
  testPath?: () => string | undefined
}): void
