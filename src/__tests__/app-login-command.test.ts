import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The gap this command closes, held open by tests.
 *
 * `pair/start` and `pair/claim` were written, tested and deployed, and the app's
 * six-digit screen worked — but nothing ever called `start`, so no code could be
 * minted. The app told people to press a button that did not exist.
 *
 * The failure was never in a function. It was in the wiring between them, which
 * is precisely what unit tests do not see: they call handlers directly and a
 * green run proves "the function is correct", not "the function is reachable".
 *
 * So these assert the WIRING. Structural, and deliberately so.
 */

const корень = path.join(__dirname, '..')
const читать = (p: string) => fs.readFileSync(path.join(корень, p), 'utf8')

describe('/app доходит до пользователя', () => {
  it('команда зарегистрирована там, где бот реально её подключает', () => {
    // registerCommands.ts — файл, который ИСПОЛНЯЕТСЯ. Экспортированный
    // обработчик, который никто не импортирует, — валидный TypeScript и
    // мёртвый код; этот репозиторий на этом обжигался не раз.
    const wiring = читать('navigation/registerCommands.ts')
    expect(wiring).toContain("from '@/commands/appLoginCommand'")
    expect(wiring).toContain('bot.use(appLoginCommand)')
  })

  it('команда видна в меню бота', () => {
    // Без строки в setCommands её не найдёт никто, кроме того, кто уже знает,
    // что она есть. Работающая и невидимая — почти то же, что отсутствующая.
    expect(читать('setCommands.ts')).toContain("command: 'app'")
  })

  it('кнопка открывает мини-апп, а не зовёт маршрут напрямую', () => {
    // Ключевое архитектурное утверждение. `pair/start` чеканит код только
    // предъявителю подписи Telegram, а она existует лишь внутри мини-аппа.
    // Обход через ключ бота завёл бы ВТОРОЙ способ представиться ради одного
    // маршрута — и именно на таком особом способе этот код уже спотыкался.
    const cmd = читать('commands/appLoginCommand.ts')
    expect(cmd).toContain('button.webApp')
    expect(cmd).toContain('buildMiniAppUrl')
    // Проверяем ВЫЗОВ, а не упоминание: первая версия этой строки искала
    // подстроку 'pair/start' и падала на комментарии, который объясняет,
    // почему маршрут здесь не зовётся. Тест, ловящий собственное объяснение,
    // ловит слова вместо поведения.
    expect(cmd).not.toMatch(/fetch\(|axios|https?:\/\/[^\s]*pair/)
  })

  it('вне личной переписки объясняет, а не молчит', () => {
    // Telegram отклоняет web_app-кнопки в группах, и отклоняет ВСЁ сообщение:
    // человек не получает ничего. Молчание читается как поломка бота.
    const cmd = читать('commands/appLoginCommand.ts')
    expect(cmd).toContain('canShowMiniAppButton')
    expect(cmd).toMatch(/личной переписке/)
  })

  it('говорит на языке собеседника', () => {
    const cmd = читать('commands/appLoginCommand.ts')
    expect(cmd).toContain('isRussianFromState')
    expect(cmd).toContain('Sign in to the app')
  })
})
