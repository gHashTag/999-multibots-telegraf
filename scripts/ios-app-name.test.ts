/**
 * The iOS app is TRINITY S³AI. "Vibee" is its OLD name.
 *
 * The owner's correction, 2026-10-03: the App Store Connect record was about
 * to be created as "Vibee" with bundle id ai.t27.vibee, because the agent read
 * both off the project. The bundle id moved to ai.t27.trinity before any
 * record existed (a bundle id cannot change once an app ships). The project
 * keeps its internal names - the directory, the scheme, VIBEE_* variables -
 * but the bundle id and every text a person can read must not say Vibee.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '..')
const IOS = path.join(ROOT, 'apps', 'vibee-ios')

const read = (rel: string) => fs.readFileSync(path.join(IOS, rel), 'utf8')

describe('iOS app name and bundle id', () => {
  it('the app, its fastlane and tri do not use the old bundle id', () => {
    // A walk, not `git grep`: the check-runner receives the tree without .git.
    // Generated and build output (Vibee.xcodeproj, build*, DerivedData) is
    // skipped - it is ignored by git and rewritten by xcodegen and xcodebuild.
    const skip = /^(node_modules|build\w*|DerivedData|\w+\.xcodeproj|\.\w+)$/
    const files: string[] = [
      path.join(ROOT, 'tri'),
      path.join(ROOT, 'bin', 'tri'),
    ]
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skip.test(e.name)) continue
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (
          /\.(swift|plist|strings|entitlements|yml|rb|sh|md|txt)$|^(Appfile|Fastfile)$/.test(
            e.name
          )
        )
          files.push(p)
      }
    }
    walk(IOS)
    expect(files.length).toBeGreaterThan(20)
    const hits = files.filter(f =>
      /ai\.t27\.vibee/.test(fs.readFileSync(f, 'utf8'))
    )
    expect(hits.map(f => path.relative(ROOT, f))).toEqual([])
  })

  it('the app target and fastlane use ai.t27.trinity', () => {
    expect(read('project.yml')).toMatch(
      /PRODUCT_BUNDLE_IDENTIFIER: ai\.t27\.trinity\b/
    )
    expect(read('fastlane/Appfile')).toContain('"ai.t27.trinity"')
    expect(read('fastlane/Fastfile')).toContain('"ai.t27.trinity"')
  })

  it('the keychain group matches the bundle id', () => {
    // The device needs the team prefix; the simulator file must NOT have it:
    // ad-hoc signing cannot resolve $(AppIdentifierPrefix) and drops the whole
    // dictionary, and Keychain answers -34018.
    expect(read('Vibee/Vibee.entitlements')).toContain(
      '<string>$(AppIdentifierPrefix)ai.t27.trinity</string>'
    )
    const sim = read('Vibee/Vibee-Simulator.entitlements')
    expect(sim).toContain('<string>ai.t27.trinity</string>')
    expect(sim).not.toContain('$(AppIdentifierPrefix)ai.t27')
  })

  it('the home-screen name is Trinity S³AI', () => {
    expect(read('Vibee/Info.plist')).toMatch(
      /<key>CFBundleDisplayName<\/key>\s*<string>Trinity S³AI<\/string>/
    )
  })

  it('no text a person reads says Vibee', () => {
    const plist = read('Vibee/Info.plist')
    const shown = [
      ...plist.matchAll(
        /<key>(NS\w+UsageDescription|CFBundleDisplayName)<\/key>\s*<string>([^<]*)</g
      ),
    ]
    expect(shown.length).toBeGreaterThan(0)
    for (const [, key, text] of shown)
      expect(`${key}: ${text}`).not.toMatch(/Vibee/i)

    for (const lproj of fs
      .readdirSync(path.join(IOS, 'Vibee'))
      .filter(d => d.endsWith('.lproj'))) {
      const strings = path.join(IOS, 'Vibee', lproj, 'InfoPlist.strings')
      if (fs.existsSync(strings))
        expect(fs.readFileSync(strings, 'utf8')).not.toMatch(/Vibee/i)
    }

    const metadata = path.join(IOS, 'fastlane', 'metadata')
    for (const locale of fs.readdirSync(metadata)) {
      const dir = path.join(metadata, locale)
      if (!fs.statSync(dir).isDirectory()) continue
      for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.txt'))) {
        expect(
          `${locale}/${f}: ${fs.readFileSync(path.join(dir, f), 'utf8')}`
        ).not.toMatch(/Vibee/i)
      }
    }

    // Swift string literals: what the app says on screen and sends as its name.
    // Case-sensitive: lowercase vibee in a service hostname is infrastructure.
    const swiftDir = path.join(IOS, 'Vibee')
    for (const f of fs
      .readdirSync(swiftDir)
      .filter(f => f.endsWith('.swift'))) {
      const literals =
        fs
          .readFileSync(path.join(swiftDir, f), 'utf8')
          .match(/"(?:[^"\\\n]|\\.)*"/g) ?? []
      for (const lit of literals) expect(lit, f).not.toMatch(/Vibee/)
    }
  })
})
