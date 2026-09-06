import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * ПОДСТАВНОЙ TELEGRAM НЕ ДОЛЖЕН ПОПАСТЬ В ПРОДАКШЕН-СБОРКУ.
 *
 * Подставка делает `window.Telegram` из параметра в адресе. В разработке это
 * единственный способ вообще увидеть экраны входа; в продакшене это была бы
 * кнопка «представиться кем угодно» — пусть и без подписи, но с чужим именем
 * на экране и чужим id в клиентских запросах.
 *
 * Проверка не верит комментарию `import.meta.env.DEV`, а СОБИРАЕТ бандл и
 * ищет в нём метку. Так же, как проверка деления по коду не верит тому, что
 * написано о делении.
 */

const КОРЕНЬ = path.join(__dirname, '..', '..')
const МЕТКА = 'mock-telegram'

describe('подставка не уезжает в продакшен', () => {
  it('исходник вообще существует и содержит метку', () => {
    // Иначе проверка ниже зеленеет на том, что искать нечего.
    const исходник = fs.readFileSync(
      path.join(КОРЕНЬ, 'src', 'lib', 'telegramDevMock.ts'),
      'utf8'
    )
    expect(исходник).toContain(МЕТКА)
    expect(исходник).toContain('import.meta.env.DEV')
  })

  it('собранный бандл метки не содержит', () => {
    const выход = path.join(КОРЕНЬ, 'dist-mock-check')
    try {
      execFileSync(
        'npx',
        ['vite', 'build', '--mode', 'production', '--outDir', выход, '--emptyOutDir'],
        { cwd: КОРЕНЬ, stdio: 'pipe', timeout: 600_000 }
      )
    } catch (e) {
      throw new Error(
        `сборка не прошла, проверка НЕ выполнена: ${String(e).slice(0, 300)}`
      )
    }
    const файлы: string[] = []
    const обойти = (к: string) => {
      for (const имя of fs.readdirSync(к)) {
        const п = path.join(к, имя)
        if (fs.statSync(п).isDirectory()) обойти(п)
        else if (имя.endsWith('.js')) файлы.push(п)
      }
    }
    обойти(выход)
    expect(файлы.length, 'бандл пуст — проверять нечего').toBeGreaterThan(0)
    const виноватые = файлы.filter(ф =>
      fs.readFileSync(ф, 'utf8').includes(МЕТКА)
    )
    fs.rmSync(выход, { recursive: true, force: true })
    expect(
      виноватые.map(ф => path.basename(ф)),
      'подставной Telegram попал в продакшен-бандл'
    ).toEqual([])
  }, 660_000)
})
