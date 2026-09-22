#!/usr/bin/env node
'use strict'
/**
 * Move one bot between the cloud Bot API and our own server, from a checkout.
 *
 * The implementation lives in deployment/telegram-bot-api/bot-api-move.cjs so
 * that it ships inside the Bot API image -- the only place that reaches our
 * server, which listens on the private network alone. This runs the same code;
 * see that file for the order of steps and why.
 *
 *   node scripts/bot-api-move.cjs <username|id>            dry run
 *   node scripts/bot-api-move.cjs <username|id> --apply    move to our server
 *   node scripts/bot-api-move.cjs <username|id> --back     release it
 *
 * Without a shell in the Bot API container, the one mode that runs from here
 * (README, step 4b):
 *
 *   railway run --service 999-multibots-telegraf -- \
 *     node scripts/bot-api-move.cjs <username>=<id> --cloud-logout
 */

const move = require('../deployment/telegram-bot-api/bot-api-move.cjs')

module.exports = move

if (require.main === module) {
  move.main(process.argv.slice(2)).then(
    () => process.exit(0),
    e => {
      console.error(`bot-api-move: ${e && e.message ? e.message : e}`)
      process.exit(1)
    }
  )
}
