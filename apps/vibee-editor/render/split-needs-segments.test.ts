import { describe, it, expect } from 'vitest'
import { SplitTalkingHeadSchema } from './src/compositions/SplitTalkingHead'

/**
 * СПЛИТ БЕЗ СЕГМЕНТОВ — НЕ СПЛИТ.
 *
 * Замер на живом ролике (лента, id 20, 30 секунд): сегментов ноль, и все
 * тридцать секунд — ОДИН слой во весь экран. Ни второй панели, ни титров, ни
 * говорящей головы отдельно. Композиция называется SplitTalkingHead и молча
 * делала не то: без сегментов текущий сегмент не находится, `isSplit` ложно,
 * размеры панелей не считаются вовсе, и `lipSyncVideo` занимает весь кадр.
 *
 * Владелец увидел это первым и назвал бедой с пропорциями. Пропорции были ни
 * при чём: сплита не было.
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

  it('БЕЗ сегментов отвергается на входе, а не рисуется не тем', () => {
    /*
     * Отказ до рендера, а не картинка не о том: заявка без сегментов не
     * станет сплитом ни при каких настройках, а рендер стоит денег и минут.
     */
    const r = SplitTalkingHeadSchema.safeParse({ ...минимум, segments: [] })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(JSON.stringify(r.error.issues)).toContain('не сплит')
    }
  })

  it('обе копии композиции держат одно правило', () => {
    // Копия для плеера и копия для рендера расходились бы молча: одна
    // отказала бы, вторая нарисовала бы полноэкранный липсинк.
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const плеер = fs.readFileSync(
      path.join(
        __dirname, '..', 'player', 'src', 'compositions', 'SplitTalkingHead.tsx'
      ),
      'utf8'
    )
    expect(плеер).toContain('z.array(SegmentSchema).min(1')
  })
})
