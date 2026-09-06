import { describe, it, expect } from 'vitest'
import { TEMPLATE_CARDS } from './src/templates/registry'
import { SplitTalkingHeadSchema } from './src/compositions/SplitTalkingHead'
import fs from 'fs'
import path from 'path'

/**
 * КТО ПОРОДИЛ ЗАЯВКУ НЕВЕРНОЙ ФОРМЫ — ОТВЕТ.
 *
 * Никакой поломки не было. `reel_render` принимает `props` СВОБОДНЫМ
 * объектом («входные данные композиции: картинки, текст, аудио и т.д.»), а
 * каталог, который агент читает перед этим, называл поле «Сегменты и
 * биролл» — ярлык, а не форму.
 *
 * Модель, которую просят собрать сплит, придумала правдоподобное:
 *
 *     segments: [{ url: "…jpg", duration: 60 }, …]
 *
 * Это ровно то, что придумал бы человек на её месте. Дальше молчали все:
 * Remotion схему сам не сверяет, сервер props не проверял, композиция без
 * `type` панели не считала — и тридцать секунд липсинка заняли весь кадр.
 * Ролик опубликовался и лежал в ленте под именем «Сплит».
 *
 * Проверка на входе теперь есть. Но отказ — половина ответа: вторая в том,
 * чтобы форму не приходилось угадывать.
 */
describe('каталог называет форму, а не только ярлык', () => {
  const сплит = TEMPLATE_CARDS.find(t => t.id === 'SplitTalkingHead')!
  const поле = сплит.fields.find(f => f.key === 'segments')!

  it('у сегментов есть форма и пример', () => {
    expect(поле.shape).toBeTruthy()
    expect(поле.example).toBeTruthy()
  })

  it('названная форма ПРОХОДИТ настоящую схему', () => {
    /*
     * Каталог, уверенно обучающий неверной форме, хуже молчащего: по нему
     * будут строить и получать отказ, не понимая почему. Поэтому пример из
     * каталога прогоняется через ту же схему, что стоит на входе рендера.
     */
    const пример = JSON.parse(поле.example!)
    const r = SplitTalkingHeadSchema.safeParse({
      lipSyncVideo: 'https://example.com/a.mp4',
      segments: пример,
    })
    expect(r.success).toBe(true)
  })

  it('форма перечисляет поля, которые схема требует', () => {
    // Не «примерно про то»: обязательные имена названы дословно.
    for (const имя of ['type', 'startFrame', 'durationFrames']) {
      expect(поле.shape).toContain(имя)
    }
  })

  it('каталог доезжает до агента целиком', () => {
    // Маршрут раскрывает карточку целиком (`...t`), иначе новая подсказка
    // осталась бы в файле и до модели не дошла.
    const сервер = fs.readFileSync(
      path.join(__dirname, 'render-server.ts'),
      'utf8'
    )
    expect(сервер).toMatch(/TEMPLATE_CARDS\.filter\(t => byId\.has\(t\.id\)\)\.map/)
    expect(сервер).toContain('...t,')
  })
})
