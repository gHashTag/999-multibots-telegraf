/*
 * tri card -- build the owner's card exactly as the seller builds it, and look.
 *
 * WHY. I know a card was pushed and I know it was not pressed. Between those
 * two facts there was nothing: how it looks on a screen, how much of it is
 * text, whether it says who this person is and why. Reasoning about that
 * without once looking is the same mistake as judging the seller by the
 * number of cards.
 *
 * The rows are LIVE (crm_leads from production) and the text is assembled by
 * the same proposalCard the bot uses. Nothing is sent and nothing is queued:
 * the card is drawn in the terminal and dies there.
 *
 * Comments here are English because this is a .ts file and the commit gate
 * checks those; the shell helpers next to it keep their Russian.
 */
import { proposalCard } from '../../src/services/telegramProposals'

const BASE = 'https://vibee-render-production.up.railway.app'
const OWNER = '144022504'

async function leads(key: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(`${BASE}/mcp?telegram_id=${OWNER}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'crm_leads', arguments: { limit: 3 } },
    }),
  })
  const body = (await r.json()) as {
    error?: unknown
    result?: { structuredContent?: unknown; content?: Array<{ text?: string }> }
  }
  // An error is not an empty list (form 71).
  if (body?.error) throw new Error('crm_leads ответил ошибкой')
  const res = body?.result
  if (!res) throw new Error('в ответе нет result')
  const shaped = (res.structuredContent ??
    JSON.parse(String(res.content?.[0]?.text ?? '{}'))) as {
    candidates?: Array<Record<string, unknown>>
  }
  const rows = shaped?.candidates
  if (!Array.isArray(rows)) throw new Error('не нашёл candidates в ответе')
  return rows
}

function ruler(n: number): string {
  return '─'.repeat(Math.min(n, 64))
}

async function main(): Promise<void> {
  const key = process.env.RENDER_API_KEY || ''
  if (!key) {
    console.log('🛑 не прочитал ключ рендера — вывода НЕ делаю.')
    process.exit(2)
  }
  const rows = await leads(key)
  if (rows.length === 0) {
    console.log('🛑 кандидатов ноль — рисовать нечего, вывода НЕ делаю.')
    process.exit(2)
  }

  for (const c of rows.slice(0, 2)) {
    // The seller writes the body itself; there is none here and inventing one
    // would be a lie. So the person's own last words stand in for it: real
    // length, real shape, and the rest of the card measured against it.
    // The FOREIGN CONTENT frame is put around third-party text FOR THE MODEL.
    // The first version printed it on the card and I took it for a defect of
    // the seller for a moment -- it was my own input, shown to a human.
    const words = String(c.last_words ?? '')
      .replace(/\[FOREIGN CONTENT[^\]]*\]\s*/g, '')
      .replace(/\s*\[END FOREIGN CONTENT\]/g, '')
      .slice(0, 220)
    const card = proposalCard(
      {
        id: 'demo',
        action: 'send',
        target: String(c.username ? '@' + c.username : (c.lead ?? '')),
        what: '(здесь будут слова продавца)',
        display: String(c.display ?? ''),
        secret: 'x'.repeat(24),
        theirWords: words,
      } as never,
      true,
      { rewrite: true, because: String(c.because ?? '') }
    )
    const lines = card.text.split('\n')
    console.log(ruler(64))
    console.log(card.text)
    console.log(ruler(64))
    const buttons = (
      card.markup as unknown as {
        reply_markup?: { inline_keyboard?: Array<Array<{ text?: string }>> }
      }
    ).reply_markup?.inline_keyboard
    console.log(
      '  кнопки: ' +
        (buttons ?? [])
          .map(row => row.map(b => `[${b.text ?? '?'}]`).join(' '))
          .join('  /  ')
    )
    console.log(
      `  знаков: ${card.text.length}, строк: ${lines.length}` +
        `, из них про человека: ${lines.filter(l => /Кому|—/.test(l)).length}`
    )
    console.log()
  }
  console.log('  Это ФОРМА карточки на живых данных. Слова продавца в ней')
  console.log('  заменены последними словами человека: их сервер отдаёт, а')
  console.log('  текст черновика — нет, и выдумывать его было бы враньём.')
}

main().catch((e: unknown) => {
  console.log('🛑 ' + (e instanceof Error ? e.message : String(e)))
  process.exit(2)
})
