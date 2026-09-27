// Random UUID v4 from the built-in crypto.randomUUID (Node 18+, Bun).
// The `uuid` package was dropped: its ESM-only versions do not work in the
// bot's CommonJS build, and randomUUID is present everywhere the bot runs.
import { randomUUID } from 'node:crypto'

export const generateUuidV4 = (): string => randomUUID()
