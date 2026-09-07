import { useCallback, useEffect, useState } from 'react'
import './ConnectTelegram.css'
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
  const [error, setError] = useState<string | null>(null)
  const [занято, setЗанято] = useState(false)
  /** Номер подставлен, а не набран. Влияет только на подпись под полем. */
  const [номерИзTelegram, setНомерИзTelegram] = useState(false)

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
        if (!живо) return
        /*
         * НОМЕР ПОДСТАВЛЯЕТСЯ, НО НЕ ОТПРАВЛЯЕТСЯ САМ.
         *
         * Владелец просил «чтобы руками не писать». Подставить — да; нажать
         * за человека «Получить код» — нет: это начало доступа к переписке.
         *
         * Поле остаётся видимым и правимым: скрытая подстановка хуже набора
         * руками, потому что человек не видит, какой номер вот-вот уйдёт.
         */
        if (д.phone) {
          setТелефон(п => п || String(д.phone))
          setНомерИзTelegram(true)
        }
        setШаг(д.подключено ? 'подключено' : 'телефон')
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

  /**
   * Turn Telegram's own wording into something a person can act on.
   *
   * The owner saw "Error: You can only invoke MTProtoRequests" on screen after
   * typing a correct code. That was a genuine bug in our code, now fixed -- but
   * the SHAPE of the message is the second problem: raw protocol text tells the
   * person nothing about what to do, and makes a working screen look broken.
   *
   * Unknown errors are passed through unchanged. Replacing them with a friendly
   * "something went wrong" would hide the only clue anybody has, and this screen
   * has already cost one evening of that.
   */
  function inPlainWords(raw: string): string {
    const up = raw.toUpperCase()
    if (up.includes('PHONE_CODE_INVALID'))
      return 'Код не подошёл. Проверьте цифры и попробуйте снова.'
    if (up.includes('PHONE_CODE_EXPIRED'))
      return 'Код устарел — запросите новый.'
    if (up.includes('PHONE_NUMBER_INVALID'))
      return 'Такого номера нет. Нужен международный вид: +79991234567.'
    if (up.includes('FLOOD_WAIT')) {
      const secs = /FLOOD_WAIT_(\d+)/.exec(up)?.[1]
      return secs
        ? `Слишком много попыток. Подождите ${Math.ceil(Number(secs) / 60)} мин.`
        : 'Слишком много попыток — подождите немного.'
    }
    if (up.includes('SESSION_PASSWORD_NEEDED'))
      return 'Нужен пароль двухфакторной защиты.'
    if (up.includes('PASSWORD_HASH_INVALID')) return 'Пароль не подошёл.'
    if (up.includes('ВХОД НЕ НАЧАТ') || up.includes('ИСТЁК'))
      return 'Вход истёк — начните заново, код живёт пару минут.'
    return raw
  }

  const шагнуть = async (дело: () => Promise<void>) => {
    setError(null)
    setЗанято(true)
    try {
      await дело()
    } catch (e) {
      setError(inPlainWords(e instanceof Error ? e.message : String(e)))
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
          className="connect-tg__off"
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
        {error && <p className="connect-tg__error">{error}</p>}
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
        <li>Код и пароль не сохраняются — они уходят в Telegram.</li>
        {/*
          НОМЕР ТЕПЕРЬ ХРАНИТСЯ, И ЭТО НАПИСАНО.
          Раньше здесь стояло «телефон, код и пароль не сохраняются». С
          подстановкой номера это стало бы ложью — а экран, обещающий не
          хранить и хранящий, хуже экрана без обещаний.
        */}
        <li>
          Номер сохраняется, чтобы не вводить его снова; при отключении
          удаляется.
        </li>
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
          {номерИзTelegram && (
            // Говорим, ОТКУДА номер: подставленный молча выглядит как чужой,
            // и человек начинает его перепроверять вместо того, чтобы нажать.
            <p className="connect-tg__hint">
              Номер из Telegram — можно исправить
            </p>
          )}
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

      {error && <p className="connect-tg__error">{error}</p>}
    </section>
  )
}
