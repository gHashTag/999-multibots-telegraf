/**
 * The notes the confirmed-send path writes into crm_touches, named once.
 *
 * A separate module on purpose: tests mock crm-touches wholesale, and a
 * constant that lived there vanished under the mock and broke the sender.
 * Nothing here has a side effect, so nothing here is ever mocked.
 */
export const SELLER_NOTE_PREFIXES = {
  message: 'отправлено из личного продавца: ',
  service: 'услуга в личке: ',
} as const
