import { execFileSync } from 'node:child_process'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CODE_LANGS,
  RUNS_PER_HOUR,
  commandFor,
  langOf,
  resetCodeBudgetForTests,
  runCode,
  type Exec,
} from './src/agent/code-run'

/**
 * THE CODING SCIENTIST'S HANDS (owner, 2026-09-26). The code is untrusted:
 * each case is a way it could reach the disk, the network, the environment or
 * a subprocess, or claim output it never produced.
 */
const ctx = { telegramId: '900000051' } as never
beforeEach(() => resetCodeBudgetForTests())

describe('what may run', () => {
  it('ts and js run; python is named but refused; anything else is a bad lang', () => {
    expect(langOf('ts')).toEqual({ ok: true, lang: 'ts' })
    expect(langOf('js')).toEqual({ ok: true, lang: 'js' })
    expect(langOf(undefined)).toEqual({ ok: true, lang: 'ts' })
    const py = langOf('python')
    expect(py.ok).toBe(false)
    if (!py.ok) expect(py.reason).toContain('python')
    expect(langOf('ruby').ok).toBe(false)
  })

  it('the command denies every permission and fetches no code', () => {
    const { cmd, args } = commandFor('ts', '/tmp/x')
    expect(cmd).toBe('deno')
    // No --allow-* anywhere, and --no-prompt so a request is an error.
    expect(args.some(a => a.startsWith('--allow'))).toBe(false)
    expect(args).toContain('--no-prompt')
    expect(args).toContain('--no-remote')
    expect(args).toContain('--no-npm')
  })
})

describe('running', () => {
  it('quotes the real output and the exit code, and runs as nobody with an empty env', async () => {
    const calls: Array<{ cmd: string; args: string[] }> = []
    const exec: Exec = async (cmd, args) => {
      calls.push({ cmd, args })
      return {
        code: 0,
        stdout: 'hello\n',
        stderr: '',
        timedOut: false,
        missing: false,
      }
    }
    const r = await runCode({ lang: 'ts', code: 'console.log("hello")' }, ctx, {
      exec,
    })
    expect(calls[0].cmd).toBe('deno')
    expect(r).toMatchObject({
      ran: true,
      passed: true,
      exit: 0,
      output: 'hello',
    })
    const src = (await import('node:fs')).readFileSync(
      `${__dirname}/src/agent/code-run.ts`,
      'utf8'
    )
    // The empty environment and the nobody uid, as hdl_run keeps them.
    expect(src).toMatch(/PATH: process\.env\.PATH/)
    expect(src).toMatch(/\.\.\.\(sandboxIds\(\) \?\? \{\}\)/)
  })

  it('a non-zero exit is not a pass, and its output is still returned', async () => {
    const exec: Exec = async () => ({
      code: 1,
      stdout: '',
      stderr: 'ReferenceError: x is not defined',
      timedOut: false,
      missing: false,
    })
    const r = (await runCode({ lang: 'js', code: 'x()' }, ctx, { exec })) as {
      ran: boolean
      passed: boolean
      output: string
    }
    expect(r).toMatchObject({ ran: true, passed: false })
    expect(r.output).toContain('ReferenceError')
  })

  it('a missing deno is said as missing, never guessed', async () => {
    const exec: Exec = async () => ({
      code: null,
      stdout: '',
      stderr: '',
      timedOut: false,
      missing: true,
    })
    const r = await runCode({ lang: 'ts', code: 'console.log(1)' }, ctx, {
      exec,
    })
    expect(r).toMatchObject({ ran: false })
    expect(String(r.reason)).toContain('не запускалось')
  })

  it('empty code is refused, and so is a program over the size cap', async () => {
    const exec: Exec = async () => ({
      code: 0,
      stdout: '',
      stderr: '',
      timedOut: false,
      missing: false,
    })
    expect((await runCode({ code: '   ' }, ctx, { exec })).ran).toBe(false)
    const big = 'a'.repeat(70 * 1024)
    expect((await runCode({ code: big }, ctx, { exec })).ran).toBe(false)
  })

  it(`at most ${RUNS_PER_HOUR} runs an hour per person`, async () => {
    const exec: Exec = async () => ({
      code: 0,
      stdout: '',
      stderr: '',
      timedOut: false,
      missing: false,
    })
    const args = { lang: 'ts' as const, code: 'console.log(1)' }
    for (let i = 0; i < RUNS_PER_HOUR; i += 1)
      expect((await runCode(args, ctx, { exec, now: () => 0 })).ran).toBe(true)
    expect((await runCode(args, ctx, { exec, now: () => 0 })).ran).toBe(false)
  })
})

const has = (t: string) => {
  try {
    execFileSync('which', [t])
    return true
  } catch {
    return false
  }
}

describe.skipIf(!has('deno'))('the real sandbox', () => {
  it('runs a program and returns exactly what it printed', async () => {
    const r = (await runCode(
      {
        lang: 'ts',
        code: 'const rev = (s: string) => [...s].reverse().join(""); console.log(rev("trinity"))',
      },
      ctx
    )) as { passed: boolean; output: string }
    expect(r.passed).toBe(true)
    expect(r.output).toBe('ytinirt')
  }, 30_000)

  it('cannot read a file: the permission is denied, not prompted', async () => {
    const r = (await runCode(
      {
        lang: 'ts',
        code: 'console.log(Deno.readTextFileSync("/etc/hostname"))',
      },
      ctx
    )) as { passed: boolean; output: string }
    expect(r.passed).toBe(false)
    expect(r.output).toMatch(/NotCapable|read access|--allow-read/)
  }, 30_000)

  it('cannot reach the network', async () => {
    const r = (await runCode(
      { lang: 'ts', code: 'await fetch("https://example.com")' },
      ctx
    )) as { passed: boolean; output: string }
    expect(r.passed).toBe(false)
    expect(r.output).toMatch(/NotCapable|net access|--allow-net/)
  }, 30_000)

  it('cannot read the environment', async () => {
    const r = (await runCode(
      { lang: 'js', code: 'console.log(Deno.env.get("PATH"))' },
      ctx
    )) as { passed: boolean; output: string }
    expect(r.passed).toBe(false)
    expect(r.output).toMatch(/NotCapable|env access|--allow-env/)
  }, 30_000)

  it('cannot run a subprocess', async () => {
    const r = (await runCode(
      { lang: 'ts', code: 'new Deno.Command("id").outputSync()' },
      ctx
    )) as { passed: boolean; output: string }
    expect(r.passed).toBe(false)
    expect(r.output).toMatch(/NotCapable|run access|--allow-run/)
  }, 30_000)

  it('a language it does not run yet is refused, not faked', async () => {
    const r = await runCode({ lang: 'python', code: 'print(1)' }, ctx)
    expect(r).toMatchObject({ ran: false })
    expect(String(r.reason)).toContain('python')
  })
})

it('every offered language has a command', () => {
  for (const lang of CODE_LANGS)
    expect(commandFor(lang, '/tmp').cmd).toBe('deno')
})
