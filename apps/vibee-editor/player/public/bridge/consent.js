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
 *  - Framed, or with no opener, the button stays hidden and nothing is sent.
 *  - A click counts only if it is trusted and the window has been visible
 *    and focused for ARM_MS. A popup that appears under the second click of a
 *    double-click, or a click that lands as the window comes forward, is not
 *    consent. Losing focus or visibility starts the wait again.
 *  - The message is {v:1, type:'tri-consent'} to window.opener with
 *    targetOrigin https://app.t27.ai, so an opener on any other origin (a
 *    t27.ai page that opened this itself) never receives it.
 *  - No storage, no cookies, no session: the bridge holds the session.
 */
;(function (window) {
  'use strict'

  var APP_ORIGIN = 'https://app.t27.ai'
  var ARM_MS = 500

  var document = window.document
  var button = document.getElementById('tri-consent')
  var opener = window.opener

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
  arm()
  window.addEventListener('focus', arm)
  window.addEventListener('blur', function () {
    armedAt = Infinity
  })
  document.addEventListener('visibilitychange', arm)

  button.addEventListener('click', function (event) {
    if (!event.isTrusted || Date.now() < armedAt) return
    button.hidden = true
    opener.postMessage({ v: 1, type: 'tri-consent' }, APP_ORIGIN)
    window.close()
  })
})(window)
