#!/usr/bin/env node
/**
 * ONE LIST OF DESTINATIONS, COPIED WHERE IT HAS TO BE READ WITHOUT A NETWORK.
 *
 * Owner, 2026-09-23: the app's structure must be the same in the web and in
 * the iOS app, taken from the backend. The backend is the source --
 * apps/vibee-editor/render/src/navigation.json, served at GET /api/navigation
 * -- but a client that opens before its first answer still has to draw a tab
 * bar, so each client ships the same bytes as a fallback.
 *
 * This copies them. The gate that proves nobody edited a copy by hand is
 * src/__tests__/tools/everyClientHasTheSameDestinations.test.ts, and it fails
 * with the exact command to run.
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const SOURCE = path.join(ROOT, 'apps/vibee-editor/render/src/navigation.json')
const COPIES = [
  'apps/vibee-editor/player/src/lib/navigation.json',
  'apps/vibee-ios/Vibee/navigation.json',
]

const bytes = fs.readFileSync(SOURCE)
let changed = 0
for (const rel of COPIES) {
  const to = path.join(ROOT, rel)
  if (!fs.existsSync(path.dirname(to))) continue
  const before = fs.existsSync(to) ? fs.readFileSync(to) : null
  if (before && before.equals(bytes)) continue
  fs.writeFileSync(to, bytes)
  console.log(`обновлено: ${rel}`)
  changed++
}
console.log(changed ? `копий обновлено: ${changed}` : 'копии совпадают')
