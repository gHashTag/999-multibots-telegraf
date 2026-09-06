import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * SOUL ОТКРЫТ И СТОИТ НА ВИДУ.
 *
 * Владелец решил: SOUL.md открыт, потому что на нём строится знакомство —
 * люди находят друг друга по интересам, а агенты a2a находят людей. Закрытый
 * SOUL связывать никого не может, а спрятанный на седьмой вкладке почти не
 * отличается от закрытого.
 */
const КАРТОЧКА = fs.readFileSync(path.join(__dirname, 'SoulCard.tsx'), 'utf8')
const СТРАНИЦА = fs.readFileSync(
  path.join(__dirname, '..', '..', 'pages', 'Profile.tsx'),
  'utf8'
)

describe('SOUL виден всем и до вкладок', () => {
  it('карточка стоит между шапкой и вкладками', () => {
    const шапка = СТРАНИЦА.indexOf('<ProfileHeader')
    const карточка = СТРАНИЦА.indexOf('<SoulCard')
    const вкладки = СТРАНИЦА.indexOf('<ProfileTabs')
    expect(шапка).toBeGreaterThan(-1)
    expect(карточка).toBeGreaterThan(шапка)
    expect(вкладки).toBeGreaterThan(карточка)
  })

  it('читается БЕЗ подписи: заголовков личности в запросе нет', () => {
    // Открыт на чтение — значит гость видит его так же, как хозяин.
    expect(КАРТОЧКА).toContain('fetch(`${API_BASE}/api/soul/')
    expect(КАРТОЧКА).not.toContain('authHeaders')
    expect(КАРТОЧКА).not.toContain('X-Telegram-Init-Data')
  })

  it('правка предлагается только своему', () => {
    // Открыт на чтение не значит открыт на запись.
    expect(КАРТОЧКА).toContain('{isOwn && onEdit && (')
  })

  it('пустота объяснена по-разному своему и гостю', () => {
    // Своему это приглашение, гостю — факт. Общий текст бесполезен обоим.
    expect(КАРТОЧКА).toContain('по этому вас найдут люди и агенты')
    expect(КАРТОЧКА).toContain('Человек ещё не рассказал о себе')
  })

  it('решётки markdown НЕ показываются человеку', () => {
    /*
     * Карточка показывала файл как есть, и человек читал «# Мой SOUL»,
     * «## Кто я». Решётка — разметка для машины; тому, кто знакомится, она
     * говорит лишь, что её не потрудились убрать.
     */
    expect(КАРТОЧКА).not.toContain('<pre className="soul-card__text">')
    expect(КАРТОЧКА).toContain("чистая.startsWith('## ')")
    expect(КАРТОЧКА).toContain("чистая.startsWith('# ')")
    // Текст вставляется ТЕКСТОМ: SOUL пишет человек, и его слова не должны
    // превращаться в HTML на чужом экране.
    expect(КАРТОЧКА).not.toContain('dangerouslySetInnerHTML')
  })

  it('адрес для агентов назван прямо на карточке', () => {
    // «Где-то есть API» — это не адрес. Открытость, о которой нельзя
    // прочитать, ничем не отличается от закрытости.
    expect(КАРТОЧКА).toContain('/api/soul/')
    expect(КАРТОЧКА).toContain('soul_of')
  })
})
