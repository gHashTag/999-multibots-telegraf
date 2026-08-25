/**
 * Подпись поста ведёт на СОБСТВЕННЫЙ домен и написана по-русски.
 *
 * ЦЕНА ОШИБКИ, ИЗМЕРЕННАЯ. Ссылка в подписи — единственное, по чему человек
 * из канала попадает в приложение. За время проекта она успела побывать:
 * мёртвым `vibee-player.fly.dev` (никуда), служебным адресом Railway
 * (работает, читается как мусор) и голым `t27.ai` (главная сайта, ленту надо
 * искать самому). Каждый раз это замечали не сразу — подпись никто не
 * проверял, потому что она «просто строка».
 *
 * Тест держит три свойства, каждое из которых уже терялось.
 */
import { describe, it, expect } from 'vitest'
import { generateDefaultCaption } from '../PublishModal'

const caption = () => generateDefaultCaption('Ролик', 'Описание', 'Автор')

describe('подпись поста в канал', () => {
  it('ведёт на собственный домен, а не на служебный адрес хостинга', () => {
    const c = caption()
    expect(c).toContain('app.t27.ai')
    expect(c).not.toMatch(/railway\.app|fly\.dev|localhost/)
  })

  it('ведёт прямо в ленту, а не на главную', () => {
    // Голый домен отдаёт сайт проекта; читателю пришлось бы искать ленту сам.
    expect(caption()).toContain('app.t27.ai/feed')
  })

  it('написана по-русски: канал русскоязычный', () => {
    const c = caption()
    // Латиница допустима только в домене и в хештегах — остальной текст
    // человеческий и русский. Английские хвосты читаются как чужой шаблон.
    const withoutAllowed = c
      .replace(/app\.t27\.ai\/feed/g, '')
      .replace(/#[^\s]+/g, '')
    expect(withoutAllowed).not.toMatch(/[A-Za-z]{4,}/)
  })

  it('вмещается в ограничение Telegram на подпись', () => {
    // sendVideo режет caption на 1024 символах — обрезанная ссылка не
    // открывается вовсе.
    const long = generateDefaultCaption('Я'.repeat(300), 'О'.repeat(600), 'А'.repeat(100))
    expect(long.length).toBeLessThanOrEqual(1024)
  })
})
