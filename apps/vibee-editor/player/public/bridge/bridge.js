/*
 * TRI IDENTITY BRIDGE: WHO THE VISITOR IS, FOR THE GAME ON https://t27.ai.
 *
 * The game runs top-level on https://t27.ai and frames this page
 * (https://app.t27.ai/bridge). It never gets this app's session: the bridge
 * reads the tab's access token and trades it for a 300 s game token that
 * /mcp accepts only from https://t27.ai and only for identity tools.
 *
 * Why a frame can see the session at all: t27.ai and app.t27.ai are one site,
 * so this frame shares the tab's app.t27.ai sessionStorage, including after
 * the tab navigated from app.t27.ai to t27.ai (measured in headless Chrome).
 *
 * Rules, each covered by player/src/__tests__/bridge-page.test.ts:
 *  - Only a message from window.parent whose origin is exactly
 *    https://t27.ai is answered, and every reply is posted to window.parent
 *    with targetOrigin https://t27.ai, never '*'.
 *  - Only three sessionStorage keys are touched: the access token, its expiry,
 *    and this tab's consent. Never the refresh token, never Telegram's
 *    '__telegram__initParams', never localStorage, never cookies. On window
 *    the location is read for ?lang= only.
 *  - The first token in a tab needs consent given in a popup, not in this
 *    frame. The origin check admits every page on t27.ai (all of gHashTag's
 *    GitHub Pages), and any of them can make this frame invisible and put it
 *    under a decoy, so a click here proves nothing (measured in Chrome). The
 *    click here only opens https://app.t27.ai/bridge/consent.html, a top-level
 *    window no framer can style or cover. Only a {v:1, type:'tri-consent'}
 *    message from that very window counts.
 *  - The prompt says who asks and for what, in the game's language (?lang=,
 *    ru or en), and refusing is as easy as agreeing: Not now here, or Not now
 *    in the popup ({v:1, type:'tri-consent-declined'} from that same window),
 *    drops the waiting request and tells the game
 *    {v:1, type:'tri-identity-dismiss', nonce} so it can hide this frame. A
 *    decline stores nothing and grants nothing.
 *  - A popup the browser blocks (window.open returns null) is said at once,
 *    in this frame.
 *  - Consent names the person: it is stored as "https://t27.ai|<telegram_id>"
 *    from the first mint after it. A later token for anyone else is dropped
 *    and consent is asked again, and every signed-out removes it.
 *  - An access token and its expiry still stored, but past the expiry, is
 *    'expired', not 'signed-out': logoutAppSession removes both keys, so the
 *    tab never signed out, only nothing refreshed the token outside the app.
 *    Consent stays, so the way back (the player refreshes and returns to the
 *    game) asks for no second popup.
 *  - When the access token disappears (sign-out in another document of this
 *    tab, or on return to a hidden tab), the game is told at once.
 *
 * No React, no Telegram script, no third-party code: nginx serves this with
 * script-src 'self' and frame-ancestors https://t27.ai (default.conf.template).
 * Everything is read through `window` so the test can hand in a fake one.
 */
;(function (window) {
  'use strict'

  var GAME_ORIGIN = 'https://t27.ai'
  var APP_ORIGIN = 'https://app.t27.ai'
  // The game passes its language as ?lang=; the prompt speaks ru and en.
  var LANG = /(?:^\?|&)lang=ru(?:&|$)/i.test(window.location.search)
    ? 'ru'
    : 'en'
  var CONSENT_URL = APP_ORIGIN + '/bridge/consent.html?lang=' + LANG
  var MINT_URL =
    'https://vibee-render-production.up.railway.app/api/auth/game-token'
  var ACCESS_KEY = 'trinity.app.session.access'
  var EXPIRES_KEY = 'trinity.app.session.expires-at'
  var CONSENT_KEY = 'trinity.bridge.consent'
  var CONSENT_PREFIX = GAME_ORIGIN + '|'

  var TEXT = {
    en: {
      purpose: 't27.ai wants your TRI name and picture',
      go: 'Continue with TRI',
      no: 'Not now',
      blocked:
        'Pop-ups are blocked for app.t27.ai. Allow them, then press Continue again.',
    },
    ru: {
      purpose: 't27.ai просит ваше имя и фото из TRI',
      go: 'Продолжить с TRI',
      no: 'Не сейчас',
      blocked:
        'Всплывающие окна для app.t27.ai заблокированы. Разрешите их и нажмите «Продолжить» ещё раз.',
    },
  }[LANG]

  var document = window.document
  var ask = document.getElementById('tri-ask')
  var button = document.getElementById('tri-continue')
  var dismissButton = document.getElementById('tri-dismiss')
  var blocked = document.getElementById('tri-blocked')
  document.documentElement.lang = LANG
  document.getElementById('tri-purpose').textContent = TEXT.purpose
  button.textContent = TEXT.go
  dismissButton.textContent = TEXT.no
  blocked.textContent = TEXT.blocked

  // The request waiting for consent; a newer request replaces it.
  var pendingNonce = null
  // The consent window this frame opened; only its message is consent.
  var popup = null
  // The last state told to the game; null until the game has asked.
  var lastState = null

  function read(key) {
    try {
      return window.sessionStorage.getItem(key)
    } catch (e) {
      return null
    }
  }

  function write(key, value) {
    try {
      if (value === null) window.sessionStorage.removeItem(key)
      else window.sessionStorage.setItem(key, value)
    } catch (e) {
      // Storage refused: the next request asks for consent again.
    }
  }

  // The prompt: the purpose line with Continue and Not now. The blocked line
  // shows only after a Continue whose popup did not open.
  function showPrompt(on) {
    ask.hidden = !on
    button.hidden = !on
    blocked.hidden = true
  }

  // The access token while the player's own expiry says it is alive.
  function accessToken() {
    var token = read(ACCESS_KEY)
    if (!token) return null
    return Number(read(EXPIRES_KEY)) > Date.now() ? token : null
  }

  // Both keys still stored and the expiry passed: nobody signed out.
  function expiredToken() {
    var expires = read(EXPIRES_KEY)
    if (!read(ACCESS_KEY) || expires === null || expires === '') return false
    return Number(expires) <= Date.now()
  }

  // The telegram_id consent was given for in this tab, or null.
  function consentedId() {
    var value = read(CONSENT_KEY)
    if (typeof value !== 'string' || value.indexOf(CONSENT_PREFIX) !== 0) {
      return null
    }
    return value.slice(CONSENT_PREFIX.length) || null
  }

  function reply(nonce, state, extra) {
    var message = { v: 1, type: 'tri-identity', nonce: nonce, state: state }
    if (extra) {
      for (var key in extra) message[key] = extra[key]
    }
    lastState = state
    window.parent.postMessage(message, GAME_ORIGIN)
  }

  function signedOut(nonce) {
    pendingNonce = null
    popup = null
    showPrompt(false)
    write(CONSENT_KEY, null)
    reply(nonce, 'signed-out')
  }

  // Not a sign-out: the consent is kept.
  function expired(nonce) {
    pendingNonce = null
    popup = null
    showPrompt(false)
    reply(nonce, 'expired')
  }

  // No live token: expired when the tab still holds one, else signed-out.
  function noSession(nonce) {
    return expiredToken() ? expired(nonce) : signedOut(nonce)
  }

  function askConsent(nonce) {
    pendingNonce = nonce
    showPrompt(true)
    reply(nonce, 'consent-required')
  }

  // Not now, here or in the popup: the prompt goes, the waiting request is
  // dropped, and the game is told so it can hide this frame. Nothing is
  // stored; the game may ask again later and is asked for consent again.
  function dismissed() {
    var nonce = pendingNonce
    pendingNonce = null
    popup = null
    showPrompt(false)
    window.parent.postMessage(
      { v: 1, type: 'tri-identity-dismiss', nonce: nonce },
      GAME_ORIGIN
    )
  }

  // expectedId: the telegram_id consent was stored for, or null right after
  // consent in the popup, when the minted id becomes the stored one.
  function mint(nonce, token, expectedId) {
    window
      .fetch(MINT_URL, {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({ aud: GAME_ORIGIN }),
      })
      .then(
        function (response) {
          return response
            .json()
            .catch(function () {
              return {}
            })
            .then(function (body) {
              // Signed out or expired while the request ran: not for them now.
              if (accessToken() !== token) return noSession(nonce)
              if (
                response.ok &&
                typeof body.game_token === 'string' &&
                typeof body.expires_in === 'number' &&
                typeof body.telegram_id === 'string'
              ) {
                if (expectedId === null) {
                  write(CONSENT_KEY, CONSENT_PREFIX + body.telegram_id)
                } else if (body.telegram_id !== expectedId) {
                  // Another person now holds this tab's session: they have
                  // not agreed, so their token is dropped unseen.
                  write(CONSENT_KEY, null)
                  return askConsent(nonce)
                }
                return reply(nonce, 'signed-in', {
                  game_token: body.game_token,
                  expires_in: body.expires_in,
                  telegram_id: body.telegram_id,
                })
              }
              var code = !response.ok
                ? typeof body.error === 'string'
                  ? body.error
                  : 'http_' + response.status
                : 'bad_response'
              reply(nonce, 'unavailable', { code: code })
            })
        },
        function () {
          reply(nonce, 'unavailable', { code: 'network' })
        }
      )
  }

  function answer(nonce) {
    var token = accessToken()
    if (!token) return noSession(nonce)
    var id = consentedId()
    if (id === null) return askConsent(nonce)
    mint(nonce, token, id)
  }

  window.addEventListener('message', function (event) {
    var data = event.data
    if (!data || typeof data !== 'object' || data.v !== 1) return

    // From the popup this frame opened and nothing else: consent, or Not now.
    if (data.type === 'tri-consent' || data.type === 'tri-consent-declined') {
      if (popup === null || event.source !== popup) return
      if (event.origin !== APP_ORIGIN || pendingNonce === null) return
      if (data.type === 'tri-consent-declined') return dismissed()
      var waiting = pendingNonce
      pendingNonce = null
      popup = null
      showPrompt(false)
      var token = accessToken()
      if (!token) return noSession(waiting)
      return mint(waiting, token, null)
    }

    if (event.origin !== GAME_ORIGIN || event.source !== window.parent) return
    if (data.type !== 'tri-identity-request') return
    var nonce = data.nonce
    if (typeof nonce !== 'string' || !nonce || nonce.length > 128) return
    answer(nonce)
  })

  button.addEventListener('click', function (event) {
    // A script-made click (element.click(), dispatchEvent) opens nothing.
    // A real one may still be a click on a decoy, so it only opens the popup.
    if (!event.isTrusted || pendingNonce === null) return
    popup =
      window.open(CONSENT_URL, '_blank', 'popup,width=420,height=320') || null
    // A blocked popup is said now, not never.
    blocked.hidden = popup !== null
  })

  dismissButton.addEventListener('click', function (event) {
    if (pendingNonce === null || !event.isTrusted) return
    dismissed()
  })

  // Tells the game once when the token went away (signed-out) or ran out
  // (expired), without being asked.
  function recheck() {
    if (lastState === null || lastState === 'signed-out') return
    if (accessToken()) return
    if (!expiredToken()) signedOut(null)
    else if (lastState !== 'expired') expired(null)
  }

  window.addEventListener('storage', function (event) {
    if (
      event.key === null ||
      event.key === ACCESS_KEY ||
      event.key === EXPIRES_KEY
    ) {
      recheck()
    }
  })

  window.document.addEventListener('visibilitychange', function () {
    if (window.document.visibilityState === 'visible') recheck()
  })
})(window)
