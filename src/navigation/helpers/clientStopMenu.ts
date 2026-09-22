/**
 * THE TWO BUTTONS UNDER "THIS CLIENT ASKED THE ASSISTANT TO STOP".
 *
 *   cso:keep:<client id>   leave it off (the default -- the press only says so)
 *   cso:on:<client id>     turn the assistant back on for this chat
 *
 * The id is always a numeric Telegram id, never a name. WHOSE assistant is
 * decided by the presser, not by the button: the store is keyed by
 * (owner, client) and the handler passes the presser's own id as the owner,
 * so a press can only ever change the presser's own row. That is why these
 * buttons work for every owner of the farm, admin or not.
 *
 * ASCII only and short, so the 64-byte callback limit is never in doubt.
 */
import { Markup } from 'telegraf'

export const CLIENT_STOP_PREFIX = 'cso:'
export const CLIENT_STOP_RE = /^cso:(keep|on):(\d{5,15})$/

export type ClientStopVerb = 'keep' | 'on'

export function clientStopCallback(
  verb: ClientStopVerb,
  client: string | number
): string {
  const id = String(client)
  if (!/^\d{5,15}$/.test(id))
    throw new Error(`client stop menu: not a numeric id: ${id}`)
  return `${CLIENT_STOP_PREFIX}${verb}:${id}`
}

/** The assistant's way back into this chat. The owner's press, only. */
export function resumeButton(client: string | number) {
  return Markup.button.callback(
    '🔔 Включить ассистента',
    clientStopCallback('on', client)
  )
}

/**
 * Under the owner's notice. `kept` is the same menu after "keep it off" was
 * pressed: the choice is acknowledged and the way back stays.
 */
export function clientStopMenu(
  client: string | number,
  o: { kept?: boolean } = {}
) {
  return Markup.inlineKeyboard(
    o.kept
      ? [[resumeButton(client)]]
      : [
          [
            Markup.button.callback(
              '🔕 Оставить выключенным',
              clientStopCallback('keep', client)
            ),
          ],
          [resumeButton(client)],
        ]
  )
}
