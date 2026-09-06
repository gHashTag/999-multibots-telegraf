import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { поШаблонам, имяШаблона } from './группыШаблонов'

/**
 * Замер, ради которого группировка и появилась: 47 записей в ленте — это ТРИ
 * композиции и одна без неё. Сорок три карточки подряд были одним шаблоном с
 * разным текстом.
 */
describe('ролики складываются по шаблонам', () => {
  const ролики = [
    { id: 1, compositionId: 'TrinityBlogReel' },
    { id: 2, compositionId: 'TrinityBlogReel' },
    { id: 3, compositionId: 'NoirReel' },
    { id: 4, compositionId: null },
    { id: 5, compositionId: 'TrinityBlogReel' },
  ]

  it('групп столько, сколько шаблонов, а не роликов', () => {
    const г = поШаблонам(ролики)
    expect(г.map(x => x.ключ)).toEqual([
      'TrinityBlogReel',
      'NoirReel',
      null,
    ])
    expect(г[0].ролики.map(р => р.id)).toEqual([1, 2, 5])
  })

  it('порядок групп — по первому ролику, а не по размеру', () => {
    /*
     * Список приходит отсортированным по дате, и «свежее сверху» человек уже
     * прочитал глазами. Пересортировка по количеству переставляла бы группы
     * после каждой генерации.
     */
    const г = поШаблонам([
      { id: 1, compositionId: 'NoirReel' },
      { id: 2, compositionId: 'TrinityBlogReel' },
      { id: 3, compositionId: 'TrinityBlogReel' },
    ])
    expect(г[0].ключ).toBe('NoirReel')
  })

  it('записи без композиции не теряются и не сливаются с чужими', () => {
    // Спрятать их значило бы потерять; свалить в общую кучу — соврать.
    const г = поШаблонам([
      { id: 1, compositionId: null },
      { id: 2, compositionId: undefined },
    ])
    expect(г.length).toBe(1)
    expect(г[0].ролики.length).toBe(2)
    expect(г[0].имя).toBe('Без шаблона')
  })

  it('незнакомый шаблон показан своим именем, а не «Другое»', () => {
    // Под «Другое» слились бы разные шаблоны, и группировка снова начала бы
    // врать. Так видно, что появился новый.
    expect(имяШаблона('TrinityBlogReel')).toBe('Блог')
    expect(имяШаблона('SplitTalkingHead')).toBe('Сплит')
    expect(имяШаблона('НовыйКакой-то')).toBe('НовыйКакой-то')
  })

  it('пустой список даёт ноль групп, а не одну пустую', () => {
    expect(поШаблонам([])).toEqual([])
  })
})

const СЕТКА = fs.readFileSync(
  path.join(__dirname, 'ProfileTemplatesGrid.tsx'),
  'utf8'
)

describe('группы подключены к экрану, а не только посчитаны', () => {
  it('сетка рисует группы, а не плоский список', () => {
    // Семнадцатое правило: помощник может быть зелёным и не подключённым.
    expect(СЕТКА).toContain('const группы = поШаблонам(templates)')
    expect(СЕТКА).toContain('profile-templates__group-head')
  })

  it('свёрнуто ВСЕГДА, даже когда группа одна', () => {
    /*
     * Поблажка «одну группу не сворачиваем» была выведена из падавших тестов,
     * а не из данных. На живом профиле первая страница — двадцать роликов
     * ОДНОГО шаблона: группа одна, значит развёрнута, значит на экране снова
     * стена карточек. Владелец увидел это первым.
     */
    expect(СЕТКА).toContain('const раскрыта = (ключ: string | null) => раскрытые.has(')
    expect(СЕТКА).not.toContain('группы.length === 1')
  })

  it('дочитываются ВСЕ страницы, иначе шаблоны видны не все', () => {
    // Страница отдаёт 20, у владельца первые двадцать — один шаблон, а
    // остальные два лежали дальше и до вкладки не доходили вовсе.
    expect(СЕТКА).toMatch(/if \(loading \|\| !hasMore \|\| page >= 9\) return/)
  })

  it('страницы не дублируются при добавлении', () => {
    // Эффект в разработке вызывается дважды: заголовок показывал 66 там, где
    // роликов 43.
    expect(СЕТКА).toContain('const было = new Set(prev.map(т => т.id))')
  })

  it('у кнопок карточки нет подписей', () => {
    /*
     * Подпись под значком не помещалась и обрезалась (`max-width: 3.1rem`), а
     * кружок в 3.3rem закрывал обложку. Значение осталось в `aria-label`.
     */
    expect(СЕТКА).not.toContain("<span>{t('profile.edit_template')}</span>")
    expect(СЕТКА).not.toContain("<span>{t('profile.delete_template')}</span>")
    expect(СЕТКА).toMatch(/aria-label=\{`\$\{t\('profile\.edit_template'\)\}/)
  })
})
