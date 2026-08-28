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
      setОшибка(
        e instanceof Error
          ? e.message
          : 'Не удалось получить код — попробуйте ещё раз'
      )
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
