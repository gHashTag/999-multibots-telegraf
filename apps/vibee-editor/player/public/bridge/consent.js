/*
 * TRI CONSENT POPUP: THE ONE CLICK THAT LETS THE GAME ON https://t27.ai
 * LEARN WHO THE VISITOR IS IN THIS TAB.
 *
 * The bridge (bridge.js) opens this page with window.open from its own frame
 * and accepts consent only as a message from this very window. It is a
 * top-level window: the page framing the bridge cannot make it transparent or
 * put a decoy over it, which it can do to the bridge frame.
 *
 * Rules, each covered by player/src/__tests__/bridge-consent.test.ts:
 *  - Framed, or with no opener, the buttons stay hidden and nothing is sent.
 *  - A click on Continue counts only if it is trusted and the window has been
 *    visible and focused for ARM_MS. A popup that appears under the second
 *    click of a double-click, or a click that lands as the window comes
 *    forward, is not consent. Losing focus or visibility starts the wait again.
 *  - The message is {v:1, type:'tri-consent'} to window.opener with
 *    targetOrigin https://app.t27.ai, so an opener on any other origin (a
 *    t27.ai page that opened this itself) never receives it.
 *  - Not now is as easy as Continue: {v:1, type:'tri-consent-declined'} to
 *    the same opener and origin, then the window closes. No wait: a refusal
 *    grants nothing.
 *  - The copy follows ?lang= (ru or en), forwarded by the bridge from the game.
 *  - No storage, no cookies, no session: the bridge holds the session.
 */
;(function (window) {
  'use strict'

  var APP_ORIGIN = 'https://app.t27.ai'
  var ARM_MS = 500
  var LANG = /(?:^\?|&)lang=ru(?:&|$)/i.test(window.location.search)
    ? 'ru'
    : 'en'
  var TEXT = {
    en: {
      title: 'TRI: continue on t27.ai?',
      asks: 'asks who you are on TRI: your Telegram id, name and picture.',
      go: 'Continue with TRI',
      no: 'Not now',
      note: 'This lasts for this tab only. Sign out in TRI to withdraw it.',
    },
    ru: {
      title: 'TRI: продолжить на t27.ai?',
      asks: 'спрашивает, кто вы в TRI: ваш Telegram id, имя и фото.',
      go: 'Продолжить с TRI',
      no: 'Не сейчас',
      note: 'Действует только в этой вкладке. Чтобы отозвать, выйдите из TRI.',
    },
  }[LANG]

  var document = window.document
  var button = document.getElementById('tri-consent')
  var decline = document.getElementById('tri-decline')
  var opener = window.opener

  document.documentElement.lang = LANG
  document.title = TEXT.title
  document.getElementById('tri-consent-asks').textContent = TEXT.asks
  document.getElementById('tri-consent-note').textContent = TEXT.note
  button.textContent = TEXT.go
  decline.textContent = TEXT.no

  // Framed, or not opened by a bridge: there is nobody to tell.
  if (window.top !== window.self || !opener) return

  // The time from which a click counts; Infinity while not visible and focused.
  var armedAt = Infinity

  function arm() {
    armedAt =
      document.visibilityState === 'visible' && document.hasFocus()
        ? Date.now() + ARM_MS
        : Infinity
  }

  button.hidden = false
  decline.hidden = false
  arm()
  window.addEventListener('focus', arm)
  window.addEventListener('blur', function () {
    armedAt = Infinity
  })
  document.addEventListener('visibilitychange', arm)

  button.addEventListener('click', function (event) {
    if (!event.isTrusted || Date.now() < armedAt) return
    button.hidden = true
    decline.hidden = true
    opener.postMessage({ v: 1, type: 'tri-consent' }, APP_ORIGIN)
    window.close()
  })

  decline.addEventListener('click', function () {
    button.hidden = true
    decline.hidden = true
    opener.postMessage({ v: 1, type: 'tri-consent-declined' }, APP_ORIGIN)
    window.close()
  })
})(window)
