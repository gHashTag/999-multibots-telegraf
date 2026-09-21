import { useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  closeLoginAtom,
  loginReasonAtom,
  showLoginModalAtom,
  userAtom,
  type LoginReason,
} from '@/atoms'
import { telegramAutoLoginAtom } from '@/atoms/telegramAuth'
import { useLanguage } from '@/hooks/useLanguage'
import { isTelegram, hasVerifiableInitData } from '@/lib/telegram'
import { TelegramLoginButton } from './TelegramLoginButton'
import { APP_ORIGIN, IS_EMBED, widgetFrameAllowed } from '@/lib/embed'
// This component's own stylesheet. It was imported by Hive and PaywallModal
// and by nothing else, so on Feed, Editor, Profile and Search the modal was
// styled only by a hand-copied duplicate living in Header/styles.css. The
// duplicate is gone; this import is what replaces it.
import './styles.css'

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
 *
 * AND A FOURTH DISTINCTION -- WHY THE MODAL WAS OPENED AT ALL. Seven places
 * open it, and the heading was the same for all of them: "Login to Export"
 * over a promise of three free video renders. True at the export button, false
 * at the other six -- somebody who pressed "Sign in" on their clients board
 * read that they had to log in to export a video. The door now names itself
 * (loginReasonAtom) and the words follow it; `login.title` stays the general
 * case and therefore promises nothing.
 *
 * ORDER MATTERS: environment first, intent second. The environment decides
 * whether signing in is possible at all; the reason only decides the sentence
 * when it is. A person inside Telegram who pressed Follow still needs to be
 * told that Telegram has already identified them, not why they pressed it.
 */

// The sentence for each door. Export and generate share one body: both draw on
// the same server quota, and two copies of one promise drift apart.
const COPY: Record<LoginReason, { title: string; body: string }> = {
  export: { title: 'login.exportTitle', body: 'login.rendersBody' },
  generate: { title: 'login.generateTitle', body: 'login.rendersBody' },
  follow: { title: 'login.followTitle', body: 'login.followBody' },
  board: { title: 'login.boardTitle', body: 'login.boardBody' },
}

export function LoginModal() {
  const { t } = useLanguage()
  const show = useAtomValue(showLoginModalAtom)
  const reason = useAtomValue(loginReasonAtom)
  const user = useAtomValue(userAtom)
  const autoLogin = useSetAtom(telegramAutoLoginAtom)
  // One writer for both atoms: closing clears the reason, so the next door
  // cannot inherit this one's words (atoms/user.ts, closeLoginAtom).
  const close = useSetAtom(closeLoginAtom)

  // Escape закрывает всегда. На телефоне модалка растянута на весь оверлей
  // (Header/styles.css: width/height 100% + align-items: stretch), свободного
  // пикселя подложки не остаётся, и без клавиши с крестиком выйти было
  // нельзя вовсе — человек оставался заперт до перезапуска приложения.
  useEffect(() => {
    if (!show) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show, close])

  if (!show) return null

  const inTelegram = isTelegram()
  const signed = hasVerifiableInitData()

  const retryFromLaunchData = () => {
    const r = autoLogin()
    if (r?.applied || user) close()
  }

  // The words for the door that opened this. No reason means the general
  // case, which has to stay true everywhere and so promises nothing.
  const copy = reason ? COPY[reason] : null
  const plain = {
    title: copy ? t(copy.title) : t('login.title'),
    body: copy ? t(copy.body) : t('login.subtitle'),
  }

  return (
    <div className="login-modal-overlay" onClick={close}>
      <div
        className="login-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
      >
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
            <h2 id="login-modal-title">{t('login.tgUnsignedTitle')}</h2>
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
            <h2 id="login-modal-title">{t('login.tgSignedTitle')}</h2>
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
          // 2026-09-14), so it would render as a blocked frame. A sign-in made
          // in the app does not carry over either, not even from the same
          // tab: the session is kept out of frames by other sites
          // (lib/framedSession.ts). Say so, and link to this screen in the app.
          <>
            <h2 id="login-modal-title">{t('embed.signInTitle')}</h2>
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
            <h2 id="login-modal-title">{plain.title}</h2>
            <p>{plain.body}</p>
            <div className="login-modal-widget">
              <TelegramLoginButton onSuccess={close} size="large" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
