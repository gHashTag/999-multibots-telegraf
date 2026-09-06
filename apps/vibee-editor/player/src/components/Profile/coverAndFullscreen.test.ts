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

describe('гостю — своя кнопка на карточке', () => {
  it('«взять» показывают ТОЛЬКО не-хозяину', () => {
    // У хозяина правка и удаление; у гостя не было ничего, кроме счётчиков.
    // Витрина, из которой нельзя ничего взять, — не витрина.
    expect(СЕТКА).toContain('{!isOwn && (')
    expect(СЕТКА).toContain('взятьШаблон(template)')
  })

  it('чужой пост не меняется: берётся СВОЯ копия', () => {
    // `useTemplateAtom` кладёт шаблон в редактор гостя ремиксом, а не правит
    // исходный — правка чужого поста сервером и так запрещена.
    expect(СЕТКА).toContain('await useTemplate(template.id)')
    // Правка чужого поста здесь и не при чём: `editTemplate` остаётся у
    // хозяина, и проверять надо, что ГОСТЕВАЯ кнопка зовёт именно взятие.
    const гость = СЕТКА.slice(СЕТКА.indexOf('{!isOwn && ('))
    expect(гость.slice(0, 700)).toContain('взятьШаблон(template)')
    expect(гость.slice(0, 700)).not.toContain('handleEditTemplate')
  })

  it('отказ назван словами, и второй раз не нажать', () => {
    expect(СЕТКА).toContain('Не вышло взять:')
    expect(СЕТКА).toContain('disabled={беруId === template.id}')
  })
})

describe('перевод SOUL — одним нажатием и в поле, а не в базу', () => {
  const РЕДАКТОР = fs.readFileSync(
    path.join(__dirname, 'SoulEditor.tsx'),
    'utf8'
  )

  it('кнопка есть и зовёт свой маршрут с личностью', () => {
    expect(РЕДАКТОР).toContain('На английский')
    expect(РЕДАКТОР).toContain("`${API_BASE}/api/soul/translate`")
    expect(РЕДАКТОР).toContain('...authHeaders()')
  })

  it('перевод кладётся в ПОЛЕ, а не сохраняется молча', () => {
    // Перевод — черновик, и решает человек: молча заменить чужие слова о
    // себе нельзя даже переводом.
    expect(РЕДАКТОР).toContain('setDraft(д.text as string)')
  })

  it('пустой черновик переводить нечего', () => {
    expect(РЕДАКТОР).toContain('disabled={перевожу || !draft.trim()}')
  })
})

describe('отладочный флаг объявляет себя', () => {
  const СТРАНИЦА = fs.readFileSync(
    path.join(__dirname, '..', '..', 'pages', 'Profile.tsx'),
    'utf8'
  )

  it('полоса показывается при флаге и только в сборке разработчика', () => {
    /*
     * `?свой=1` принудительно включает режим «это мой профиль». Молчащий флаг
     * стоил владельцу времени: он увидел у себя кнопки правки и решил, что их
     * видят все. Кнопки и правда только у хозяина — хозяином его сделал флаг.
     */
    expect(СТРАНИЦА).toContain('profile-devflag')
    expect(СТРАНИЦА).toMatch(/import\.meta\.env\.DEV &&\s*\n?\s*new URLSearchParams/)
  })

  it('полоса называет, как вернуться к гостевому виду', () => {
    // «Режим разработчика» без «что делать» — та же загадка, только вежливее.
    expect(СТРАНИЦА).toContain('Уберите метку из адреса')
  })
})
