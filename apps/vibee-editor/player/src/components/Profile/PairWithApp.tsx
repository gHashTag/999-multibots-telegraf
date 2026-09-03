import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import { API_BASE } from '@/config'

/**
 * Выдача кода для входа в нативное приложение.
 *
 * ЗАЧЕМ ЭТО ЗДЕСЬ, А НЕ В ПРИЛОЖЕНИИ. Приложение не внутри Telegram и подпись
 * `initData` получить не может — никогда. Значит личность обязана родиться
 * там, где подпись есть: на этой странице. Отсюда и направление: код
 * ВЫДАЁТСЯ здесь и ГАСИТСЯ там.
 *
 * ПОЧЕМУ ЦИФРЫ, А НЕ ССЫЛКА. Диплинк был бы на два тапа короче, но
 * refresh-токен в адресной строке оседает в логах, в истории буфера обмена и
 * у того, кто рисует ссылку. Шесть цифр, прочитанных глазами, не оставляют
 * копии нигде. Так же входят на телевизорах, и ровно по этой причине.
 */
export function PairWithApp() {
  const [код, setКод] = useState<string | null>(null)
  const [осталось, setОсталось] = useState(0)
  const [идёт, setИдёт] = useState(false)
  const [ошибка, setОшибка] = useState<string | null>(null)
  const таймер = useRef<number | null>(null)

  // Обратный отсчёт: код живёт две минуты, и человек должен видеть, сколько
  // ещё. Без этого истёкший код выглядит как сломанный сервер.
  useEffect(() => {
    if (осталось <= 0) return
    таймер.current = window.setTimeout(() => setОсталось(с => с - 1), 1000)
    return () => {
      if (таймер.current) window.clearTimeout(таймер.current)
    }
  }, [осталось])

  useEffect(() => {
    if (осталось === 0 && код) setКод(null)
  }, [осталось, код])

  async function выдать() {
    setИдёт(true)
    setОшибка(null)
    try {
      const r = await apiFetch<{ code: string; expires_in: number }>(
        `${API_BASE}/api/auth/pair/start`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }
      )
      setКод(r.code)
      setОсталось(r.expires_in)
    } catch (e) {
      /**
       * SHOW BOTH THE REASON AND WHAT TO DO ABOUT IT.
       *
       * This used to be `e.message` alone, which is the server's `detail`
       * field -- "empty initData". True, and useless to a person: it names
       * the fault in protocol terms and says nothing about the next move.
       *
       * The next move lives in `hint`, which the server sends alongside ("the
       * code is issued only inside Telegram -- that is where the signature
       * is") and which `apiFetch` carefully attaches to the error object.
       * This screen was throwing it away. Measured 2026-09-03: not one new
       * row in `app_pairing_codes` in 24 hours against three claim attempts --
       * the person pressed the button, read "empty initData", and had no way
       * to learn that the mini app was open outside Telegram.
       */
      const hint = (e as { hint?: string } | null)?.hint
      const reason =
        e instanceof Error
          ? e.message
          : 'Не удалось получить код — попробуйте ещё раз'
      setОшибка(hint ? `${reason}. ${hint}` : reason) // cyrillic-ok: existing setter name
    }
    setИдёт(false)
  }

  const мм = String(Math.floor(осталось / 60))
  const сс = String(осталось % 60).padStart(2, '0')

  return (
    <section
      style={{
        border: '1px solid rgba(255,255,255,.12)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
        Вход в приложение
      </h3>

      {код ? (
        <>
          <div
            /**
             * Код разбит пробелом на две тройки, а не дефисом.
             *
             * Дефис люди набирают вслед за экраном, и приложению пришлось бы
             * его вычищать — оно и вычищает, но лучше не создавать повод.
             * Пробел никто не набирает.
             */
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 38,
              fontWeight: 700,
              letterSpacing: '.14em',
              textAlign: 'center',
              padding: '10px 0',
              userSelect: 'all',
            }}
            aria-label={`Код ${код.split('').join(' ')}`}
          >
            {код.slice(0, 3)} {код.slice(3)}
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              opacity: 0.6,
              textAlign: 'center',
            }}
          >
            Введите его в приложении. Осталось {мм}:{сс}
          </p>
        </>
      ) : (
        <p style={{ margin: 0, fontSize: 13, opacity: 0.65 }}>
          Нажмите, чтобы получить код. Он действует две минуты и подходит только
          для одного входа.
        </p>
      )}

      {ошибка && (
        <p style={{ margin: 0, fontSize: 13, color: '#e8705c' }}>{ошибка}</p>
      )}

      <button
        onClick={выдать}
        disabled={идёт}
        style={{
          minHeight: 44,
          borderRadius: 10,
          border: 'none',
          background: '#2f6b3f',
          // Чёрный на зелёном: белый на этом фоне не читается — отдельная
          // жалоба, уже оплаченная один раз.
          color: '#000',
          fontWeight: 600,
          fontSize: 15,
          cursor: идёт ? 'default' : 'pointer',
        }}
      >
        {идёт ? 'Получаем…' : код ? 'Новый код' : 'Получить код'}
      </button>
    </section>
  )
}
