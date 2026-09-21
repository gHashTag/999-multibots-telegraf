/**
 * Writes public/sounds/bamboo.wav from src/lib/bambooSound.ts.
 *
 *   npx tsx scripts/make-bamboo-sound.ts
 *
 * The numbers live in the module; this file only renders them. A test
 * (src/lib/bambooSound.test.ts) fails when the two drift apart.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bambooSamples, encodeWav } from '../src/lib/bambooSound'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'public', 'sounds', 'bamboo.wav')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, encodeWav(bambooSamples()))
console.log(`wrote ${out}`)
