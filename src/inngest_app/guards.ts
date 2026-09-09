/**
 * Shared validation guards for Inngest functions.
 *
 * Contract (design: inngest-spec-first §3.1): input defects — schema failures,
 * missing users/bots, missing text/images, amount mismatch, unparseable ids —
 * must throw `NonRetriableError`. A plain `Error` makes Inngest burn every
 * retry (probe evidence: 17 functions spent 3–4 attempts, ~5 minutes each, on
 * inputs that could never become valid).
 */
import { NonRetriableError } from 'inngest'
import type { ZodTypeAny, z } from 'zod'

/**
 * Parse `data` with a zod schema; on failure throw `NonRetriableError` with a
 * compact `path: message` list instead of zod's default multi-line dump.
 */
export function parseEventData<S extends ZodTypeAny>(
  schema: S,
  data: unknown,
  label = 'event data'
): z.infer<S> {
  const result = schema.safeParse(data)
  if (!result.success) {
    const details = result.error.errors
      .map(e => `${e.path.join('.') || '(root)'}: ${e.message}`)
      .join(', ')
    throw new NonRetriableError(`Invalid ${label}: ${details}`)
  }
  return result.data
}

/** Throw `NonRetriableError` when a required value is null/undefined/empty. */
export function requireValue<T>(
  value: T | null | undefined | '',
  message: string
): T {
  if (value === null || value === undefined || value === '') {
    throw new NonRetriableError(message)
  }
  return value as T
}
