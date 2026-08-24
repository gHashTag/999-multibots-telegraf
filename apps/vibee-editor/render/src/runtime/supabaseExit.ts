type RuntimeEnvironment = Record<string, string | undefined>

/**
 * Returns labels only. Environment values are deliberately never included so
 * a startup failure cannot turn a secret into a log line.
 */
export function supabaseRuntimeViolations(env: RuntimeEnvironment): string[] {
  const violations = new Set<string>()

  for (const [key, value] of Object.entries(env)) {
    if (!value?.trim()) continue
    if (/SUPABASE/i.test(key)) {
      violations.add(`${key}:configuration`)
    }
    if (/(?:^|[/:.])supabase\.[a-z0-9.-]+(?:[/:]|$)/i.test(value)) {
      violations.add(`${key}:host`)
    }
  }

  return [...violations].sort()
}
/** Production player/render artifacts are immutable Supabase-free lanes. */
export function assertSupabaseFreeRuntime(env: RuntimeEnvironment): void {
  const violations = supabaseRuntimeViolations(env)
  if (violations.length) {
    throw new Error(
      `Supabase runtime configuration is forbidden (${violations.join(', ')})`
    )
  }
}
