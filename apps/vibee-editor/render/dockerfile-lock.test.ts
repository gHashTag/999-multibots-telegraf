import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dockerfile = readFileSync(
  new URL('./Dockerfile', import.meta.url),
  'utf8'
)

describe('render Docker reproducible install', () => {
  it('copies the lockfile before npm ci', () => {
    const copy = 'COPY render/package.json render/package-lock.json ./render/'
    expect(dockerfile).toContain(copy)
    expect(dockerfile.indexOf(copy)).toBeLessThan(
      dockerfile.indexOf('RUN npm ci --install-links')
    )
  })
})
