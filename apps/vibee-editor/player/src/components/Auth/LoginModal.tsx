import { useCallback, useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { showLoginModalAtom, userAtom } from '@/atoms'
import { telegramAutoLoginAtom } from '@/atoms/telegramAuth'
import { useLanguage } from '@/hooks/useLanguage'
import { isTelegram, hasVerifiableInitData } from '@/lib/telegram'
import { TelegramLoginButton } from './TelegramLoginButton'
import { APP_ORIGIN, IS_EMBED, widgetFrameAllowed } from '@/lib/embed'

/**
 * Одна модалка входа на всё приложение.
 *
 * Раньше её разметка была скопирована в Header и Profile, и обе копии внутри
 * Telegram показывали заголовок, подзаголовок и ПУСТОЕ место: единственный
 * элемент управления — TelegramLoginButton — внутри мини-аппа возвращает null.
 * Человек видел «Login to Export» без единой кнопки и не мог ничего сделать.
 *
 * Здесь развели три РАЗНЫХ состояния, потому что и причины разные:
 *
 *   1. Обычный браузер — нужен вход, кнопка Telegram уместна.
 *   2. Мини-апп с подписью — входить не нужно вообще; модалка не должна
 *      открываться, а если открылась, честно закрывается сама.
 *   3. Мини-апп без подписи (запуск с reply-кнопки) — войти неоткуда, и
 *      просить «войдите» бессмысленно. Говорим, что делать: открыть через
 *      кнопку меню бота.
 */
export function LoginModal() {
  const { t } = useLanguage()
  const show = useAtomValue(showLoginModalAtom)
  const setShow = useSetAtom(showLoginModalAtom)
  const user = useAtomValue(userAtom)
  const autoLogin = useSetAtom(telegramAutoLoginAtom)

  // Escape закрывает всегда. На телефоне модалка растянута на весь оверлей
  // (Header/styles.css: width/height 100% + align-items: stretch), свободного
  // пикселя подложки не остаётся, и без клавиши с крестиком выйти было
  // нельзя вовсе — человек оставался заперт до перезапуска приложения.
  useEffect(() => {
    if (!show) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShow(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show, setShow])

  const close = useCallback(() => setShow(false), [setShow])

  if (!show) return null

  const inTelegram = isTelegram()
  const signed = hasVerifiableInitData()

  const retryFromLaunchData = () => {
    const r = autoLogin()
    if (r?.applied || user) close()
  }

  return (
    <div className="login-modal-overlay" onClick={close}>
      <div className="login-modal" onClick={e => e.stopPropagation()}>
        {/* Крестик есть всегда: на телефоне подложка полностью перекрыта. */}
        <button
          className="login-modal-close"
          type="button"
          onClick={close}
          aria-label={t('common.close')}
        >
          &times;
        </button>
        {inTelegram && !signed ? (
          <>
            <h2>{t('login.tgUnsignedTitle')}</h2>
            <p>{t('login.tgUnsignedBody')}</p>
            <div className="login-modal-widget">
              <button
                className="telegram-login-btn"
                type="button"
                onClick={close}
              >
                <span>{t('common.close')}</span>
              </button>
            </div>
          </>
        ) : inTelegram ? (
          <>
            <h2>{t('login.tgSignedTitle')}</h2>
            <p>{t('login.tgSignedBody')}</p>
            <div className="login-modal-widget">
              <button
                className="telegram-login-btn"
                type="button"
                onClick={retryFromLaunchData}
              >
                <span>{t('login.tgContinue')}</span>
              </button>
            </div>
          </>
        ) : IS_EMBED && !widgetFrameAllowed() ? (
          // Inside the game's TRI frame on t27.ai. Telegram's widget frame
          // accepts only https://app.t27.ai as an ancestor (measured
          // 2026-09-14), so it would render as a blocked frame, and a sign-in
          // made in the app does not carry over into this partitioned frame.
          // Say so, and link to this screen in the app.
          <>
            <h2>{t('embed.signInTitle')}</h2>
            <p>{t('embed.signInBody')}</p>
            <div className="login-modal-widget">
              <a
                className="telegram-login-btn embed-open-app"
                href={APP_ORIGIN + window.location.pathname}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>{t('embed.openApp')}</span>
              </a>
            </div>
          </>
        ) : (
          <>
            <h2>{t('login.title')}</h2>
            <p>{t('login.subtitle')}</p>
            <div className="login-modal-widget">
              <TelegramLoginButton onSuccess={close} size="large" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
