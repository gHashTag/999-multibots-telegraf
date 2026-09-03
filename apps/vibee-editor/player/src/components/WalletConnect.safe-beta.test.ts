import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const componentSource = readFileSync(
  path.join(process.cwd(), 'src/components/WalletConnect.tsx'),
  'utf8'
)
const appSource = readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8')

describe('SAFE BETA wallet boundary', () => {
  it('ships no wallet connection client or provider in the application path', () => {
    expect(componentSource).not.toMatch(/useWeb3Modal|useAccount|useDisconnect/)
    expect(appSource).not.toContain('ConditionalWeb3Provider')
  })

  it('renders an explicit immutable disabled state', () => {
    expect(componentSource).toContain('Payments unavailable in SAFE BETA')
    expect(componentSource).toMatch(/disabled/)
  })
})
