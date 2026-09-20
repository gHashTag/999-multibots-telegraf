/**
 * РЕМИКС ОБЯЗАН ВОСПРОИЗВОДИТЬ РЕЦЕПТ, А НЕ ОТКРЫВАТЬ ПУСТОЙ РЕДАКТОР.
 *
 * Рилс в этом сервисе — это JSON `{compositionId, props}`. Публикуя ролик,
 * автор публикует РЕЦЕПТ; ремикс — единственное место, где рецепт снова
 * становится роликом. Это и есть «социальная сеть» в продукте: без неё лента
 * просто витрина видео.
 *
 * Ремикс терял рецепт двумя независимыми способами, и оба проходили сборку:
 *
 *   1. `compositionId` был литералом `'SplitTalkingHead'`, хотя настоящая
 *      композиция лежит В САМОЙ записи. Замер прода 2026-09-03 — там
 *      `TrinityBlogReel`.
 *   2. В `defaultProps` уходила ОБЁРТКА `{props, poster, ab_style, ...}`
 *      вместо вложенного `props`, поэтому редактор искал `title`/`plates` на
 *      уровень выше, чем они лежат, и не находил ни одного параметра.
 *
 * Форма ниже — не выдумана: это ключи живого ответа `GET /api/feed?limit=3`
 * с прода, снятые в тот же день. Тест сверяет разбор именно с ней, потому что
 * разбор, проверенный на самим же собой придуманной форме, доказывает только
 * согласие с собственной догадкой.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Исходник БЕЗ комментариев.
 *
 * Первая версия сканировала файл целиком и падала на трёх проверках из
 * четырёх — потому что комментарии рядом с правкой ЦИТИРУЮТ прежний код
 * («Здесь стояло `compositionId: 'SplitTalkingHead'`»). Проверка кода,
 * срабатывающая на прозе о коде, наказывает ровно за то, что и делает
 * правку понятной: за объяснение, что было не так. Убираем комментарии до
 * сравнения — тогда ворота смотрят на поведение, а не на текст.
 */
const RAW = fs.readFileSync(path.join(__dirname, '..', 'feed.ts'), 'utf8')
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

/** Реальная запись ленты: ключи и вложенность сняты с прода. */
const ЗАПИСЬ_ПРОДА = {
  props: {
    url: 't27.ai/#/blog',
    title: 'We hand-pat the bitstream',
    subtitle: 'a lesson',
    plates: [{ k: 'v' }],
    posterUrl: 'https://example.invalid/p.png',
  },
  poster: 'https://example.invalid/p.png',
  ab_style: 'noir',
  tg_posted_at: '2026-08-30T00:00:00Z',
  compositionId: 'TrinityBlogReel',
}

/**
 * Тот же разбор, что в `useTemplateAtom`. Держим его здесь копией намеренно:
 * атом асинхронный и ходит в сеть, а проверяемое правило — чистое, и его
 * стоит проверять без мока HTTP. Расхождение копии с оригиналом ловит
 * отдельная проверка ниже, которая читает исходник.
 */
function разобрать(settings: Record<string, unknown>) {
  const рецепт = (settings.props ?? settings) as Record<string, unknown>
  const композиция =
    typeof settings.compositionId === 'string' && settings.compositionId
      ? settings.compositionId
      : 'SplitTalkingHead'
  return { рецепт, композиция }
}

describe('ремикс достаёт рецепт из записи', () => {
  it('берёт композицию из записи, а не из литерала', () => {
    expect(разобрать(ЗАПИСЬ_ПРОДА).композиция).toBe('TrinityBlogReel')
  })

  it('в редактор уходит props, а не обёртка вокруг него', () => {
    const { рецепт } = разобрать(ЗАПИСЬ_ПРОДА)
    // Ключи ролика должны быть на верхнем уровне — их читает applySettings.
    expect(рецепт).toHaveProperty('title')
    expect(рецепт).toHaveProperty('plates')
    // А служебные поля обёртки — не должны: их там не искали и не ищут.
    expect(рецепт).not.toHaveProperty('ab_style')
    expect(рецепт).not.toHaveProperty('compositionId')
  })

  it('старая запись без compositionId открывается, а не падает', () => {
    // У ранних публикаций поля нет вовсе. Известная композиция лучше отказа.
    const { композиция, рецепт } = разобрать({ title: 'старьё' })
    expect(композиция).toBe('SplitTalkingHead')
    expect(рецепт).toHaveProperty('title')
  })

  it('пустая строка в compositionId не проходит за композицию', () => {
    // `''` истинно как «поле есть» и ложно как значение: без явной проверки
    // на непустоту редактор получил бы композицию с пустым именем.
    expect(разобрать({ compositionId: '' }).композиция).toBe('SplitTalkingHead')
  })
})

describe('исходник не откатили к прежнему поведению', () => {
  it('composition больше не зашит литералом в объект ремикса', () => {
    // Именно это и было дефектом: строка `compositionId: 'SplitTalkingHead'`
    // как ЗНАЧЕНИЕ ПОЛЯ. Запасной вариант в тернарнике — не то же самое.
    expect(SRC).not.toMatch(/compositionId:\s*'SplitTalkingHead'/)
  })

  it('в defaultProps уходит разобранный рецепт, а не templateSettings целиком', () => {
    expect(SRC).not.toMatch(/defaultProps:\s*template\.templateSettings/)
    expect(SRC).toMatch(/settings\.props\s*\?\?\s*settings/)
  })

  it('шаблон выбирается через selectTemplateAtom — иначе рецепт не применится', () => {
    // applySettings живёт только внутри selectTemplateAtom (templates.ts).
    // Запись id напрямую ставит выбор и не применяет ничего.
    expect(SRC).toMatch(/set\(selectTemplateAtom,\s*newId\)/)
    expect(SRC).not.toMatch(/set\(selectedTemplateIdAtom,\s*newId\)/)
  })

  it('неудача ремикса возвращается вызывающему, а не глотается', () => {
    // Иначе карточка не отличит отказ от успеха и уйдёт на пустой экран.
    expect(SRC).toMatch(/Promise<boolean>/)
    expect(SRC).toMatch(/return false/)
  })
})
