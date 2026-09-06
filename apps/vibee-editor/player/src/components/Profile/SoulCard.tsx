import { useEffect, useState } from 'react'
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

export function SoulCard({ username, isOwn, onEdit }: SoulCardProps) {
  const [текст, setТекст] = useState<string | null>(null)
  const [развёрнуто, setРазвёрнуто] = useState(false)

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

  const строки = текст.split('\n')
  const длинный = строки.length > СТРОК_В_ПРЕВЬЮ
  const показать =
    развёрнуто || !длинный ? текст : строки.slice(0, СТРОК_В_ПРЕВЬЮ).join('\n')

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
          <pre className="soul-card__text">{показать}</pre>
          {длинный && (
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
