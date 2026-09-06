import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { SplitTalkingHeadSchema } from './src/compositions/SplitTalkingHead'

/**
 * СПЛИТ, КОТОРЫЙ НЕ СПЛИТ.
 *
 * Замер на живом ролике (лента, id 20, 1080×1920, 30 секунд): кадры на 2, 15
 * и 25 секунде — ОДИН слой во весь экран. Ни второй панели, ни титров.
 * Композиция называется SplitTalkingHead и делала не то, чем называется.
 *
 * ПОПРАВКА К ПЕРВОЙ ПОПЫТКЕ. Сначала я решил, что сегментов ноль, и закрыл
 * пустой массив. Проверил настройки — их ТРИ, но формы `{url, duration}`:
 *
 *     [{"url": "…jpg", "duration": 60}, …]
 *
 * `SegmentSchema` требует `{type, startFrame, durationFrames}`. Ни у одного
 * из трёх нет `type`, поэтому `isSplit` ложно, размеры панелей не считаются,
 * слой биролла не рисуется — и `lipSyncVideo` занимает весь кадр.
 *
 * То есть `.min(1)` этот ролик пропустил бы. Настоящая дыра была не в схеме,
 * а в том, что схему НИКТО НЕ ПРИМЕНЯЛ.
 */
const минимум = {
  lipSyncVideo: 'https://example.com/a.mp4',
  segments: [
    {
      type: 'split',
      startFrame: 0,
      durationFrames: 90,
      bRollUrl: 'https://example.com/b.mp4',
    },
  ],
}

describe('заявка на сплит', () => {
  it('с сегментом принимается', () => {
    expect(SplitTalkingHeadSchema.safeParse(минимум).success).toBe(true)
  })

  it('ФОРМА сегментов проверяется, а не только их наличие', () => {
    // `{url, duration}` названы дословно: это форма, которая уже доехала до
    // ленты и выглядела правдоподобно.
    const r = SplitTalkingHeadSchema.safeParse({
      ...минимум,
      segments: [
        { url: 'https://example.com/a.jpg', duration: 60 },
        { url: 'https://example.com/b.jpg', duration: 60 },
      ],
    })
    expect(r.success).toBe(false)
  })

  it('БЕЗ сегментов тоже отвергается', () => {
    const r = SplitTalkingHeadSchema.safeParse({ ...минимум, segments: [] })
    expect(r.success).toBe(false)
    if (!r.success) expect(JSON.stringify(r.error.issues)).toContain('не сплит')
  })

  it('обе копии композиции держат одно правило', () => {
    // Копия для плеера и копия для рендера расходились бы молча: одна
    // отказала бы, вторая нарисовала бы полноэкранный липсинк.
    const плеер = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'player',
        'src',
        'compositions',
        'SplitTalkingHead.tsx'
      ),
      'utf8'
    )
    expect(плеер).toContain('z.array(SegmentSchema).min(1')
  })
})

describe('схема ПРИМЕНЯЕТСЯ, а не только описана', () => {
  const СЕРВЕР = fs.readFileSync(
    path.join(__dirname, 'render-server.ts'),
    'utf8'
  )

  it('заявка сверяется со схемой ДО рендера', () => {
    /*
     * Схема жила в композиции и никем не применялась: Remotion сам её не
     * сверяет, а props приходили как есть. То есть она была документацией, а
     * ролик неверной формы доезжал до ленты и выглядел другим шаблоном.
     */
    expect(СЕРВЕР).toContain(
      'const проверка = ПРОВЕРЯЕМЫЕ_КОМПОЗИЦИИ[req.compositionId]'
    )
    expect(СЕРВЕР).toMatch(/проверка\.safeParse\(inputProps\)/)
    // Проверка обязана стоять ПЕРЕД выбором композиции: иначе рендер начат.
    expect(СЕРВЕР.indexOf('проверка.safeParse(inputProps)')).toBeLessThan(
      СЕРВЕР.indexOf('const composition = await selectComposition')
    )
  })

  it('отказ называет ПОЛЕ, а не «неверная форма»', () => {
    // Без поля человек и агент угадывают, что именно не так.
    expect(СЕРВЕР).toContain("i.path.join('.') || '(корень)'")
  })
})
