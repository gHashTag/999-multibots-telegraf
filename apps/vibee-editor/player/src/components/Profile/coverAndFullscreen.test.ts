import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ШАПКА = fs.readFileSync(
  path.join(__dirname, 'ProfileHeader.tsx'),
  'utf8'
)
const СЕТКА = fs.readFileSync(
  path.join(__dirname, 'ProfileTemplatesGrid.tsx'),
  'utf8'
)

describe('обложка делается по нажатию, а не всем подряд', () => {
  it('кнопка есть и только у хозяина', () => {
    /*
     * Рисуем за свой счёт. Генерация каждому при входе — расход на всех
     * сразу, включая тех, кто обложку никогда не откроет; по нажатию платим
     * ровно за желающих.
     */
    expect(ШАПКА).toContain('Сделать обложку')
    const блок = ШАПКА.slice(ШАПКА.indexOf('{isOwn && ('))
    expect(блок.slice(0, 1200)).toContain('сделатьОбложку')
  })

  it('нажатие уходит с личностью и на свой маршрут', () => {
    expect(ШАПКА).toContain("`${API_BASE}/api/profile/cover`")
    expect(ШАПКА).toContain('headers: authHeaders()')
  })

  it('результат виден сразу, а отказ назван словами', () => {
    // Человек нажал — он должен увидеть итог, а не гадать, получилось ли.
    expect(ШАПКА).toContain('setСвежаяОбложка(д.coverUrl as string)')
    expect(ШАПКА).toContain('Не получилось:')
  })

  it('пока рисуется — второй раз не нажать', () => {
    // Иначе одно нажатие превращается в несколько оплаченных картинок.
    expect(ШАПКА).toContain('disabled={делаю}')
  })
})

describe('плей открывает ролик на весь экран', () => {
  it('после старта воспроизведения зовётся разворот', () => {
    // Плитка в сетке — превью размером с ноготь, а нажимают «плей» именно
    // чтобы разглядеть.
    expect(СЕТКА).toMatch(/await video\.play\(\)[\s\S]{0,900}?void развернуть\(video\)/)
  })

  it('учтён iPhone, где работает только свой способ', () => {
    // На Safari/iOS разворачивает лишь `webkitEnterFullscreen` у элемента
    // video; без него «на весь экран» на телефоне не случится вовсе.
    expect(СЕТКА).toContain('webkitEnterFullscreen')
    expect(СЕТКА).toContain('video.requestFullscreen')
  })

  it('отказ разворота не роняет воспроизведение', () => {
    // Полноэкранный режим требует жеста и может быть запрещён политикой —
    // это не повод обрывать ролик.
    const кусок = СЕТКА.slice(СЕТКА.indexOf('const развернуть'))
    expect(кусок.slice(0, 900)).toContain('} catch {')
  })
})
