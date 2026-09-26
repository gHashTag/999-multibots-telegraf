/**
 * THE MARGIN OF EVERY IMAGE AND VIDEO THE CODE CAN SELL -- `tri margin`.
 *
 * Read from the code's own tables: the provider costs the charge is priced
 * from, the token prices the charge takes, the club's own rate for what a
 * token brings in. No network and no tokens: a report that has to call a
 * provider to say what the provider costs is a report nobody runs.
 *
 * WHY IT EXISTS. On 2026-09-22 the video price was found below cost in two
 * places at once -- a flat 40 tokens for a Replicate clip billed by the
 * second, and five Kie models charged one second of a clip the provider made
 * five seconds long -- and nothing in the repository could have shown it
 * without reading five files and doing the arithmetic by hand. This does the
 * arithmetic.
 *
 * TWO LINES ARE DRAWN, AND THEY ARE DIFFERENT QUESTIONS:
 *
 *   LOSS         the club revenue of the tokens is below what the provider
 *                bills us -- we pay for the person's picture;
 *   UNDER FLOOR  the tokens are below the billing rule's own floor, ceil(cost
 *                x markup / base) -- still paid for, but the owner's markup is
 *                not kept.
 *
 * And for a Kie model whose price-list name matches several variants, both
 * are asked again at the DEAREST variant (kie-prices.generated.ts), because
 * which variant the provider bills is its choice, not ours.
 */

import {
  COST_PER_TOKEN_USD,
  OPERATION_COST_USD,
  TOKEN_PRICES,
  REPLICATE_VIDEO_LENGTHS,
  REPLICATE_VIDEO_MODEL,
  REPLICATE_VIDEO_RESOLUTION,
  replicateClipCostUsd,
  replicateClipTokens,
  isKieVideoModel,
  kieVideoSaleOf,
  kieVideoQuote,
  priceForKieModel,
  tokensForCostUsd,
} from './billing-shared'
import {
  СЕБЕСТОИМОСТЬ_USD, // cyrillic-ok: generated table name
  ЕДИНИЦА_ЦЕНЫ, // cyrillic-ok: generated table name
  DEAREST_VARIANT_USD,
} from './kie-prices.generated'
import { KIE_WEB_MODELS } from './kie-web-provider'
import {
  everyImageLegName,
  imageChainCeilingUsd,
  imageLegCost,
  legFitsPrice,
} from '../image-chain'
import { EDIT_MODEL, LEAD_MAGNET_MODEL } from '../kie-image'
import {
  CLUB_STARS,
  CLUB_TOKEN_SHARE,
  clubTokensPerPeriod,
} from './club-membership'

const KIE_COST = СЕБЕСТОИМОСТЬ_USD // cyrillic-ok: alias of the generated table
const KIE_UNIT = ЕДИНИЦА_ЦЕНЫ // cyrillic-ok: alias of the generated table

/**
 * What one Telegram Star brings the developer, USD.
 *
 * Telegram's own terms, https://telegram.org/tos/bot-developers section
 * 6.2.4, read 2026-09-22: "Developers can receive an equivalent of 0.013 USD
 * worth of rewards for each Telegram Star."
 */
export const STAR_PAYOUT_USD = 0.013

/**
 * THE CLUB'S OWN RATE: how many Stars stand behind one token the club pays
 * out. Thirty percent of every 10 000-Star charge returns as tokens
 * (club-membership.ts), so 3 000 Stars buy `clubTokensPerPeriod()` tokens --
 * about 1.17 Stars a token, the top pack rate. Computed from the club's
 * constants, so a change of the club's price or share moves this report.
 */
export function clubStarsPerToken(): number {
  return (CLUB_STARS * CLUB_TOKEN_SHARE) / clubTokensPerPeriod()
}

/** What one token brings in at the club's rate, USD. */
export function clubUsdPerToken(): number {
  return clubStarsPerToken() * STAR_PAYOUT_USD
}

export type MarginFlag =
  | 'LOSS'
  | 'UNDER FLOOR'
  | 'LOSS AT DEAREST'
  | 'UNDER FLOOR AT DEAREST'

export interface MarginRow {
  kind: 'image' | 'video'
  /** What is sold, as the charge names it. */
  model: string
  /** What one sale buys: "5 s clip", "per second x 10 s", "image". */
  unit: string
  /** Where it is sold. */
  sold: string
  /** What the provider bills for one sale, USD (cheapest variant for Kie). */
  costUsd: number
  /** The dearest variant the price-list name matches, when it differs. */
  dearestUsd: number | null
  tokens: number
  /** `tokens` at the club's rate. */
  revenueUsd: number
  marginUsd: number
  /** Margin as a share of revenue, 0..1 (negative for a loss). */
  marginShare: number
  flags: MarginFlag[]
}

/** Models the code refuses to sell, with the reason, for the same report. */
export interface RefusedRow {
  kind: 'image' | 'video'
  model: string
  why: string
}

/**
 * The flags of one sale. Pure, so a test can hand it any numbers: the line
 * between a sale and a loss is exactly what must not move by accident.
 */
export function marginFlags(
  costUsd: number,
  dearestUsd: number | null,
  tokens: number,
  usdPerToken: number
): MarginFlag[] {
  const revenue = tokens * usdPerToken
  const flags: MarginFlag[] = []
  if (revenue < costUsd) flags.push('LOSS')
  if (tokens < tokensForCostUsd(costUsd)) flags.push('UNDER FLOOR')
  if (dearestUsd != null && dearestUsd > costUsd) {
    if (revenue < dearestUsd) flags.push('LOSS AT DEAREST')
    if (tokens < tokensForCostUsd(dearestUsd))
      flags.push('UNDER FLOOR AT DEAREST')
  }
  return flags
}

function row(
  kind: MarginRow['kind'],
  model: string,
  unit: string,
  sold: string,
  costUsd: number,
  dearestUsd: number | null,
  tokens: number,
  usdPerToken: number
): MarginRow {
  const revenueUsd = tokens * usdPerToken
  const marginUsd = revenueUsd - costUsd
  return {
    kind,
    model,
    unit,
    sold,
    costUsd,
    dearestUsd: dearestUsd != null && dearestUsd > costUsd ? dearestUsd : null,
    tokens,
    revenueUsd,
    marginUsd,
    marginShare: revenueUsd > 0 ? marginUsd / revenueUsd : -Infinity,
    flags: marginFlags(costUsd, dearestUsd, tokens, usdPerToken),
  }
}

const round6 = (n: number) => Number(n.toFixed(6))

/** Every image and video sale the code can make today, with its margin. */
export function marginReport(usdPerToken: number = clubUsdPerToken()): {
  rows: MarginRow[]
  refused: RefusedRow[]
} {
  const rows: MarginRow[] = []
  const refused: RefusedRow[] = []

  /*
   * IMAGE. `image_generate` is one price over a chain of legs; a leg dearer
   * than the price covers is skipped by the chain, never run (image-chain.ts),
   * so only the legs that run are sales.
   */
  const ceiling = imageChainCeilingUsd()
  for (const leg of everyImageLegName()) {
    const cost = imageLegCost(leg)
    if (cost == null || !legFitsPrice(cost, ceiling)) {
      refused.push({
        kind: 'image',
        model: leg,
        why:
          cost == null
            ? 'no cost recorded, the chain does not run it'
            : `costs $${cost}, over the $${ceiling} the image price covers: skipped by the chain`,
      })
      continue
    }
    rows.push(
      row(
        'image',
        leg,
        'image',
        'image_generate (agent, app default)',
        cost,
        null,
        TOKEN_PRICES.image_generate,
        usdPerToken
      )
    )
  }
  // The agent's img2img: every story-reel still. Missing from this report
  // until 2026-09-26, which is how it sold 2 tokens against a $0.02 picture.
  if (OPERATION_COST_USD.image_edit != null)
    rows.push(
      row(
        'image',
        `kie/${EDIT_MODEL}`,
        'image',
        'image_edit (agent img2img, story stills)',
        OPERATION_COST_USD.image_edit,
        DEAREST_VARIANT_USD[EDIT_MODEL] ?? null,
        TOKEN_PRICES.image_edit,
        usdPerToken
      )
    )
  rows.push(
    row(
      'image',
      `kie/${LEAD_MAGNET_MODEL}`,
      'image',
      'gpt_image_edit (lead magnet)',
      OPERATION_COST_USD.gpt_image_edit,
      DEAREST_VARIANT_USD[LEAD_MAGNET_MODEL] ?? null,
      TOKEN_PRICES.gpt_image_edit,
      usdPerToken
    )
  )
  for (const id of [...KIE_WEB_MODELS.image].sort()) {
    const cost = KIE_COST[id]
    const price = priceForKieModel(id)
    if (cost == null || price == null) continue
    rows.push(
      row(
        'image',
        `kie/${id}`,
        KIE_UNIT[id] ?? 'call',
        'app (Kie model)',
        cost,
        DEAREST_VARIANT_USD[id] ?? null,
        price,
        usdPerToken
      )
    )
  }

  /* VIDEO. The Replicate leg by length, then every Kie video by the rule. */
  for (const s of REPLICATE_VIDEO_LENGTHS) {
    rows.push(
      row(
        'video',
        `${REPLICATE_VIDEO_MODEL} ${REPLICATE_VIDEO_RESOLUTION}`,
        `${s} s clip`,
        'video_generate (agent, app default)',
        replicateClipCostUsd(s),
        null,
        replicateClipTokens(s),
        usdPerToken
      )
    )
  }
  const videos = Object.keys(KIE_COST).filter(isKieVideoModel).sort()
  for (const id of videos) {
    const sale = kieVideoSaleOf(id)
    if (!sale.sold) {
      if (KIE_COST[id] != null) {
        refused.push({ kind: 'video', model: `kie/${id}`, why: sale.why })
      }
      continue
    }
    if (!KIE_WEB_MODELS.video.has(id)) continue
    // The route's own lengths: the chip is 6 or 10 s; a file is measured, so
    // one second is shown and the bill multiplies it.
    const lengths =
      sale.per === 'clip' ? [1] : sale.length === 'person' ? [6, 10] : [1]
    for (const n of lengths) {
      const quote = kieVideoQuote(id, n)
      if ('refused' in quote) continue
      const dearest = DEAREST_VARIANT_USD[id]
      rows.push(
        row(
          'video',
          `kie/${id}`,
          sale.per === 'clip'
            ? 'clip'
            : sale.length === 'person'
              ? `${n} s (per second)`
              : 'per second of the file',
          'app (Kie model)',
          quote.costUsd,
          dearest == null
            ? null
            : round6(dearest * (sale.per === 'clip' ? 1 : n)),
          quote.tokens,
          usdPerToken
        )
      )
    }
  }
  return { rows, refused }
}

const usd = (n: number) => `$${n.toFixed(n < 0.1 ? 4 : 3)}`
const pad = (s: string, n: number) =>
  s.length >= n ? s : s + ' '.repeat(n - s.length)
const left = (s: string, n: number) =>
  s.length >= n ? s : ' '.repeat(n - s.length) + s

/** The report as text, one sale a line, the flagged ones counted at the end. */
export function formatMarginReport(
  report: { rows: MarginRow[]; refused: RefusedRow[] },
  usdPerToken: number = clubUsdPerToken()
): string {
  const out: string[] = []
  out.push(
    `club rate: ${clubStarsPerToken().toFixed(4)} Stars a token x $${STAR_PAYOUT_USD} ` +
      `= $${usdPerToken.toFixed(5)} a token; billing base $${COST_PER_TOKEN_USD} a token`
  )
  out.push('')
  out.push(
    [
      pad('kind', 6),
      pad('model', 46),
      pad('one sale', 22),
      left('cost', 9),
      left('dearest', 9),
      left('tokens', 7),
      left('revenue', 9),
      left('margin', 9),
      left('%', 5),
      'flags',
    ].join(' ')
  )
  for (const r of report.rows) {
    out.push(
      [
        pad(r.kind, 6),
        pad(r.model, 46),
        pad(r.unit, 22),
        left(usd(r.costUsd), 9),
        left(r.dearestUsd == null ? '' : usd(r.dearestUsd), 9),
        left(String(r.tokens), 7),
        left(usd(r.revenueUsd), 9),
        left(usd(r.marginUsd), 9),
        left(`${Math.round(r.marginShare * 100)}`, 5),
        r.flags.join(', '),
      ].join(' ')
    )
  }
  if (report.refused.length) {
    out.push('')
    out.push('not sold:')
    for (const r of report.refused)
      out.push(`  ${pad(r.kind, 6)} ${pad(r.model, 46)} ${r.why}`)
  }
  const flagged = report.rows.filter(r => r.flags.length)
  const losses = report.rows.filter(r => r.flags.includes('LOSS'))
  out.push('')
  out.push(
    `${report.rows.length} sales, ${losses.length} below cost, ` +
      `${flagged.length} flagged in any way`
  )
  return out.join('\n')
}
