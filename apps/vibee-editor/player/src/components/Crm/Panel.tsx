import type { ReactNode } from 'react'
import { useLanguage } from '@/hooks/useLanguage'

/**
 * A PANEL THAT COULD NOT LOAD SAYS SO.
 *
 * Rendering zeros for an unreachable server tells the owner their business is
 * dead -- a worse lie than an empty screen, and indistinguishable from a quiet
 * week. Lifted out of `pages/Crm.tsx` unchanged so the client dashboard shares
 * the same rule rather than a second copy of it.
 */
export interface PanelState {
  reachable: boolean
  error?: string
}

export function Panel({
  title,
  state,
  children,
}: {
  title: string
  state: PanelState
  children: ReactNode
}) {
  const { t } = useLanguage()
  return (
    <section className="crm__panel">
      <h3 className="crm__panel-title">{title}</h3>
      {state.reachable ? (
        children
      ) : (
        <p className="crm__unreachable">
          {t('crm.unreachable')}
          {state.error ? `: ${state.error}` : ''}
        </p>
      )}
    </section>
  )
}
