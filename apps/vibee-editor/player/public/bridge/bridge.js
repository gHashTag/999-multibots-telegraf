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
 *  - Only three sessionStorage keys are read: the access token, its expiry,
 *    and this tab's consent. Never the refresh token, never Telegram's
 *    '__telegram__initParams', never localStorage, never cookies.
 *  - The first token in a tab needs a real click on the button here. The
 *    origin check admits every page on t27.ai (all of gHashTag's GitHub
 *    Pages), so without the click any of them would learn who the visitor is.
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
  var MINT_URL =
    'https://vibee-render-production.up.railway.app/api/auth/game-token'
  var ACCESS_KEY = 'trinity.app.session.access'
  var EXPIRES_KEY = 'trinity.app.session.expires-at'
  var CONSENT_KEY = 'trinity.bridge.consent'

  var button = window.document.getElementById('tri-continue')
  // The request waiting for the click; a newer request replaces it.
  var pendingNonce = null
  // The last state told to the game; null until the game has asked.
  var lastState = null

  function read(key) {
    try {
      return window.sessionStorage.getItem(key)
    } catch (e) {
      return null
    }
  }

  // The access token while the player's own expiry says it is alive.
  function accessToken() {
    var token = read(ACCESS_KEY)
    if (!token) return null
    return Number(read(EXPIRES_KEY)) > Date.now() ? token : null
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
    button.hidden = true
    reply(nonce, 'signed-out')
  }

  function mint(nonce, token) {
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
              // Signed out while the request ran: that token is not theirs now.
              if (accessToken() !== token) return signedOut(nonce)
              if (
                response.ok &&
                typeof body.game_token === 'string' &&
                typeof body.expires_in === 'number' &&
                typeof body.telegram_id === 'string'
              ) {
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
    if (!token) return signedOut(nonce)
    if (read(CONSENT_KEY) !== GAME_ORIGIN) {
      pendingNonce = nonce
      button.hidden = false
      return reply(nonce, 'consent-required')
    }
    mint(nonce, token)
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== GAME_ORIGIN || event.source !== window.parent) return
    var data = event.data
    if (!data || typeof data !== 'object') return
    if (data.v !== 1 || data.type !== 'tri-identity-request') return
    var nonce = data.nonce
    if (typeof nonce !== 'string' || !nonce || nonce.length > 128) return
    answer(nonce)
  })

  button.addEventListener('click', function (event) {
    // A script-made click (element.click(), dispatchEvent) is not consent.
    if (!event.isTrusted || pendingNonce === null) return
    var nonce = pendingNonce
    pendingNonce = null
    button.hidden = true
    var token = accessToken()
    if (!token) return signedOut(nonce)
    try {
      window.sessionStorage.setItem(CONSENT_KEY, GAME_ORIGIN)
    } catch (e) {
      // Storage refused: this click still counts, the next request asks again.
    }
    mint(nonce, token)
  })

  function recheck() {
    if (lastState === null || lastState === 'signed-out') return
    if (!accessToken()) signedOut(null)
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
