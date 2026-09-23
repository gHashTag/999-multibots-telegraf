import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { API_BASE } from '../../config'

/**
 * SOUL НА ГЛАВНОЙ ПРОФИЛЯ — У ВСЕХ, А НЕ ВО ВКЛАДКЕ ДЛЯ СЕБЯ.
 *
 * SOUL.md — это то, кем человек себя считает и что ему интересно. Владелец
 * решил, что он открыт: на нём строится знакомство людей друг с другом и
 * агентов a2a с людьми. Закрытый SOUL связывать никого не может, а
 * спрятанный на седьмой вкладке — почти то же самое.
 *
 * Поэтому карточка стоит СРАЗУ под шапкой профиля, до вкладок, и видна
 * гостю. Правка по-прежнему только своя — открыт на чтение не значит открыт
 * на запись.
 *
 * Показываем первые строки, а не весь файл: карточка знакомит, а не заменяет
 * чтение. Полный текст открывается по кнопке.
 */
interface SoulCardProps {
  username: string
  isOwn: boolean
  onEdit?: () => void
}

/** Сколько строк показать свёрнутой карточкой. */
const СТРОК_В_ПРЕВЬЮ = 6

/**
 * SOUL — ЭТО ТЕКСТ С ЗАГОЛОВКАМИ, А НЕ ИСХОДНИК MARKDOWN.
 *
 * Карточка показывала файл как есть, и человек читал решётки: «# Мой SOUL»,
 * «## Кто я». Решётка — разметка для машины; тому, кто знакомится, она
 * говорит только, что мы не потрудились её убрать.
 *
 * Разбираем ровно то подмножество, которым SOUL и написан: заголовки двух
 * уровней и абзацы. Полноценный разборщик markdown сюда не тянем — он принёс
 * бы таблицы, ссылки и картинки, которых в SOUL нет, и вместе с ними
 * возможность выполнить чужую разметку на нашей странице.
 *
 * Текст вставляется ТЕКСТОМ, а не разметкой: SOUL пишет человек, и его слова
 * не должны превращаться в HTML на чужом экране.
 */
function разметить(строки: string[]) {
  return строки.map((строка, i) => {
    const чистая = строка.trim()
    if (!чистая) return <div key={i} className="soul-card__gap" />
    if (чистая.startsWith('## ')) {
      return (
        <h3 key={i} className="soul-card__h2">
          {чистая.slice(3)}
        </h3>
      )
    }
    if (чистая.startsWith('# ')) {
      return (
        <h3 key={i} className="soul-card__h1">
          {чистая.slice(2)}
        </h3>
      )
    }
    return (
      <p key={i} className="soul-card__p">
        {чистая}
      </p>
    )
  })
}

export function SoulCard({ username, isOwn, onEdit }: SoulCardProps) {
  const [текст, setТекст] = useState<string | null>(null)
  const [развёрнуто, setРазвёрнуто] = useState(false)

  const textRef = useRef<HTMLDivElement>(null)
  const [cut, setCut] = useState(false)

  /*
   * IS THE PREVIEW CUT OFF? ONLY THE DRAWN BOX KNOWS.
   *
   * The card keeps six SOURCE lines, but on a phone one source line wraps to
   * two or three and Profile.css caps the drawn height, so a short file can
   * still be cut while `длинный` (six lines or more) stays false -- and the
   * "read it all" button, which only followed that flag, was missing exactly
   * where the text had been hidden. The box compares its own scroll height
   * with its clipped height instead, and says so.
   */
  useEffect(() => {
    const box = textRef.current
    if (!box) return
    const measure = () => setCut(box.scrollHeight > box.clientHeight + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(measure)
    watch.observe(box)
    return () => watch.disconnect()
  })

  useEffect(() => {
    let живо = true
    fetch(`${API_BASE}/api/soul/${encodeURIComponent(username)}`)
      .then(о => (о.ok ? о.json() : null))
      .then(д => {
        if (живо) setТекст(typeof д?.soul === 'string' ? д.soul : '')
      })
      .catch(() => {
        // Молчим НАМЕРЕННО: SOUL не обязан загрузиться, чтобы работал профиль.
        if (живо) setТекст('')
      })
    return () => {
      живо = false
    }
  }, [username])

  if (текст === null) return null

  // cyrillic-ok-next-line: the state in this file is named in Russian
  const open = развёрнуто
  const строки = текст.split('\n')
  const длинный = строки.length > СТРОК_В_ПРЕВЬЮ
  const показать =
    развёрнуто || !длинный ? строки : строки.slice(0, СТРОК_В_ПРЕВЬЮ)

  return (
    <section className="soul-card" data-soul-owner={username}>
      <header className="soul-card__head">
        <Sparkles size={16} />
        <h2 className="soul-card__title">SOUL.md</h2>
        {isOwn && onEdit && (
          <button type="button" className="soul-card__edit" onClick={onEdit}>
            Изменить
          </button>
        )}
      </header>

      {текст.trim() === '' ? (
        /*
         * Пустоту ОБЪЯСНЯЕМ, и по-разному своему и гостю: своему это
         * приглашение, гостю — факт. Общий текст был бы бесполезен обоим.
         */
        <p className="soul-card__empty">
          {isOwn
            ? 'Пока пусто. Напишите, кто вы и что вам интересно, — по этому вас найдут люди и агенты.'
            : 'Человек ещё не рассказал о себе.'}
        </p>
      ) : (
        <>
          <div
            ref={textRef}
            className="soul-card__text"
            data-open={open ? '1' : undefined}
          >
            {разметить(показать)}
          </div>
          {/* Cut text always offers the way in, however few lines it has. */}
          {/* cyrillic-ok-next-line: existing names in this file are Russian */}
          {(длинный || cut) && (
            <button
              type="button"
              className="soul-card__more"
              onClick={() => setРазвёрнуто(в => !в)}
            >
              {развёрнуто ? 'Свернуть' : 'Читать целиком'}
            </button>
          )}
        </>
      )}

      {/*
        Адрес для агентов назван ПРЯМО на карточке.

        Внешнему агенту нужно знать, куда идти, и «где-то есть API» — это не
        адрес. Здесь он виден и человеку: открытость, о которой нельзя
        прочитать, ничем не отличается от закрытости.
      */}
      <p className="soul-card__a2a">
        Открыт для агентов: <code>GET /api/soul/{username}</code> · инструмент{' '}
        <code>soul_of</code>
      </p>
    </section>
  )
}
