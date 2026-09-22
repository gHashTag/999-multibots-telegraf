/*
 * THE BADGE THAT SAYS WHY THIS SCREEN AND NOT THE OTHER ONE.
 *
 * Owner, 2026-09-22, asking for a mark that admins can see saying why he does
 * not land on the screen he expects. The reasoning lives in screenVerdict.ts;
 * this is only its face -- collapsed to one line, opened with a tap.
 *
 * ADMINS ONLY, AND THE CHECK IS A UX CHECK. `isAdmin()` reads the launch
 * user on the client (config/admin.ts) and is therefore not a privilege
 * boundary. It does not need to be: everything shown here is the state of
 * THIS person's own screen, already in this browser's memory. Nothing
 * secret is added by showing it; the gate exists so an ordinary customer is
 * not shown machinery.
 *
 * The button is the other half of the complaint. A pass makes the club
 * active, so the road skips the paywall and an admin cannot reach the till
 * to test it. The server now takes money from a granted person who asks
 * (club-membership.ts), so the button opens that step on purpose.
 */
import { useState } from 'react'
import { isAdmin } from '@/config/admin'
import {
  canStillPay,
  screenVerdict,
  type FactState,
  type VerdictInput,
} from './screenVerdict'
import './AdminScreenBadge.css'

const MARK: Record<FactState, string> = { yes: '✓', no: '✗', unknown: '…' }

/* Badge wording. Kept out of the JSX so a reformat cannot separate a line of
 * Russian UI text from the marker that allows it. */
const TAG = 'админ' // cyrillic-ok: badge text
const META_SCREEN = 'экран: ' // cyrillic-ok: badge text
const META_STEP = ' · шаг: ' // cyrillic-ok: badge text
const META_DECIDED = ' · решил: ' // cyrillic-ok: badge text
const OPEN_PAYMENT = 'Открыть шаг оплаты' // cyrillic-ok: button label

export function AdminScreenBadge(props: {
  facts: VerdictInput
  /** Open the paywall step anyway. Absent = no button. */
  onOpenPayment?: () => void
}) {
  const [open, setOpen] = useState(false)
  if (!isAdmin()) return null

  const v = screenVerdict(props.facts)
  const payable = canStillPay(props.facts)

  return (
    <div className="admin-badge" data-screen={v.screen}>
      <button
        type="button"
        className="admin-badge__line"
        onClick={() => setOpen(o => !o)}
      >
        <span className="admin-badge__tag">{TAG}</span>
        <span className="admin-badge__reason">{v.reason}</span>
        <span className="admin-badge__chevron">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="admin-badge__body">
          <dl className="admin-badge__facts">
            {v.rows.map(row => (
              <div key={row.label} className="admin-badge__fact">
                <dt>
                  <span className={`admin-badge__mark is-${row.state}`}>
                    {MARK[row.state]}
                  </span>
                  {row.label}
                </dt>
                {row.note && <dd>{row.note}</dd>}
              </div>
            ))}
          </dl>

          <p className="admin-badge__meta">
            {META_SCREEN}
            <b>{v.screen}</b>
            {v.step ? (
              <>
                {META_STEP}
                <b>{v.step}</b>
              </>
            ) : null}
            {META_DECIDED}
            <b>{v.decidedBy}</b>
          </p>

          {payable && props.onOpenPayment && (
            <button
              type="button"
              className="admin-badge__act"
              onClick={props.onOpenPayment}
            >
              {OPEN_PAYMENT}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
