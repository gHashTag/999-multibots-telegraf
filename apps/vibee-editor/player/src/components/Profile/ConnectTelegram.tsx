import { useCallback, useEffect, useState } from 'react'
import { API_BASE } from '../../config'
import { authHeaders } from '@/lib/apiFetch'

/**
 * ПОДКЛЮЧЕНИЕ СВОЕГО TELEGRAM — ЭКРАН, КОТОРЫЙ НЕ ВРЁТ О ПОСЛЕДСТВИЯХ.
 *
 * Владелец: «надо чтобы бот прямо в телеграм запрашивал доступ, чтобы там вся
 * настройка у клиентов».
 *
 * Код НЕ спрашивают в чате: отправленный сообщением внутри Telegram, он
 * аннулируется платформой — так она защищает людей от самой частой кражи
 * аккаунта. Форма живёт на нашем домене, и код через переписку не проходит.
 *
 * ── ЧЕСТНОСТЬ ЗДЕСЬ ВАЖНЕЕ КРАСОТЫ ─────────────────────────────────────────
 *
 * Человек отдаёт доступ к своей переписке. Экран обязан сказать это прямо, до
 * ввода телефона: что получит агент, что НЕ хранится, и как отключить. Форма,
 * которая умалчивает и выглядит «как в Telegram», — это фишинг по форме, чем
 * бы она ни была по намерению. Поэтому здесь наш заголовок, наши слова и ни
 * одной попытки выглядеть системным окном.
 */

type Шаг = 'проверка' | 'подключено' | 'телефон' | 'код' | 'пароль'

export function ConnectTelegram() {
  const [шаг, setШаг] = useState<Шаг>('проверка')
  const [телефон, setТелефон] = useState('')
  const [код, setКод] = useState('')
  const [пароль, setПароль] = useState('')
  const [handle, setHandle] = useState('')
  const [ошибка, setОшибка] = useState<string | null>(null)
  const [занято, setЗанято] = useState(false)

  const запрос = useCallback(
    async (путь: string, метод: string, тело?: unknown) => {
      const о = await fetch(`${API_BASE}${путь}`, {
        method: метод,
        headers: authHeaders(),
        body: тело ? JSON.stringify(тело) : undefined,
      })
      const д = await о.json().catch(() => ({}))
      if (!о.ok || д?.ok === false) {
        throw new Error(д?.error || `сервер ответил ${о.status}`)
      }
      return д
    },
    []
  )

  useEffect(() => {
    let живо = true
    запрос('/api/tg/connect/status', 'GET')
      .then(д => {
        if (живо) setШаг(д.подключено ? 'подключено' : 'телефон')
      })
      .catch(() => {
        // Не удалось спросить — показываем форму. Заявить «не подключено»
        // было бы догадкой, а предложить подключить можно всегда.
        if (живо) setШаг('телефон')
      })
    return () => {
      живо = false
    }
  }, [запрос])

  const шагнуть = async (дело: () => Promise<void>) => {
    setОшибка(null)
    setЗанято(true)
    try {
      await дело()
    } catch (e) {
      setОшибка(e instanceof Error ? e.message : String(e))
    } finally {
      setЗанято(false)
    }
  }

  if (шаг === 'проверка') return null

  if (шаг === 'подключено') {
    return (
      <section className="connect-tg">
        <h3>Telegram подключён</h3>
        <p>
          Агент видит ваши диалоги, контакты и может искать по переписке. Он
          ничего не отправляет от вашего имени без вашего подтверждения.
        </p>
        <button
          type="button"
          disabled={занято}
          onClick={() =>
            void шагнуть(async () => {
              await запрос('/api/tg/connect', 'DELETE')
              setШаг('телефон')
            })
          }
        >
          Отключить
        </button>
        {ошибка && <p className="connect-tg__error">{ошибка}</p>}
      </section>
    )
  }

  return (
    <section className="connect-tg">
      <h3>Подключить Telegram</h3>

      {/*
        Согласие ДО ввода телефона, а не мелким шрифтом под кнопкой. Человек
        решает, зная последствия, — иначе это не согласие.
      */}
      <ul className="connect-tg__facts">
        <li>Агент сможет читать ваши диалоги, контакты и историю сообщений.</li>
        <li>Писать кому-либо он будет только после вашего подтверждения.</li>
        <li>Телефон, код и пароль не сохраняются — они уходят в Telegram.</li>
        <li>Отключить можно здесь же, в одно нажатие.</li>
      </ul>

      {шаг === 'телефон' && (
        <>
          <input
            type="tel"
            inputMode="tel"
            placeholder="+7 999 123-45-67"
            value={телефон}
            onChange={e => setТелефон(e.target.value)}
          />
          <button
            type="button"
            disabled={занято || !телефон.trim()}
            onClick={() =>
              void шагнуть(async () => {
                const д = await запрос('/api/tg/connect/start', 'POST', {
                  phone: телефон,
                })
                setHandle(д.handle)
                setТелефон(д.phone)
                setШаг('код')
              })
            }
          >
            {занято ? 'Отправляю код…' : 'Получить код'}
          </button>
        </>
      )}

      {шаг === 'код' && (
        <>
          {/* Телефон показан ещё раз: опечатку надо заметить сейчас, а не
              после десяти минут ожидания сообщения. */}
          <p className="connect-tg__hint">
            Код отправлен в Telegram на {телефон}. Он придёт сообщением от
            Telegram — введите его сюда, не пересылайте никому.
          </p>
          <input
            inputMode="numeric"
            placeholder="12345"
            value={код}
            onChange={e => setКод(e.target.value)}
          />
          <button
            type="button"
            disabled={занято || !код.trim()}
            onClick={() =>
              void шагнуть(async () => {
                const д = await запрос('/api/tg/connect/code', 'POST', {
                  handle,
                  code: код,
                })
                setШаг(д.нужен_пароль ? 'пароль' : 'подключено')
              })
            }
          >
            {занято ? 'Проверяю…' : 'Подтвердить'}
          </button>
        </>
      )}

      {шаг === 'пароль' && (
        <>
          <p className="connect-tg__hint">
            У вас включена двухфакторная защита. Введите её пароль — он не
            сохраняется.
          </p>
          <input
            type="password"
            value={пароль}
            onChange={e => setПароль(e.target.value)}
          />
          <button
            type="button"
            disabled={занято || !пароль}
            onClick={() =>
              void шагнуть(async () => {
                await запрос('/api/tg/connect/password', 'POST', {
                  handle,
                  password: пароль,
                })
                setПароль('')
                setШаг('подключено')
              })
            }
          >
            {занято ? 'Проверяю…' : 'Войти'}
          </button>
        </>
      )}

      {ошибка && <p className="connect-tg__error">{ошибка}</p>}
    </section>
  )
}
