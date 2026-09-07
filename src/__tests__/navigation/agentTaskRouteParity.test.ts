import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { AGENT_TASK_ROUTES } from '@/navigation/helpers/agentTaskButtons'

/** Read the actual player exports without pulling browser files into rootDir. */
function loadPlayerRoutes(): Record<string, string> {
  const directory = path.join(process.cwd(), 'apps/vibee-editor/player/src/lib')
  function evaluate(name: 'miniAppRoutes' | 'aiPipeline') {
    const source = readFileSync(path.join(directory, `${name}.ts`), 'utf8')
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    })
    const module = { exports: {} as Record<string, unknown> }
    runInNewContext(outputText, {
      module,
      exports: module.exports,
      require: (dependency: string) => {
        if (dependency !== './aiPipeline')
          throw new Error(`Unexpected route dependency: ${dependency}`)
        return evaluate('aiPipeline')
      },
      URLSearchParams,
    })
    return module.exports
  }
  return evaluate('miniAppRoutes').MINI_APP_TASK_ROUTES as Record<
    string,
    string
  >
}

describe('bot and Mini App task navigation contract', () => {
  it('keeps every offered destination on the exact same player route', () => {
    expect(AGENT_TASK_ROUTES).toEqual(loadPlayerRoutes())
  })
})
