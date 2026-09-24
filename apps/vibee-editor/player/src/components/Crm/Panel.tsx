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
  quiet = false,
}: {
  title: string
  state: PanelState
  children: ReactNode
  /**
   * This panel's failure is already stated once, above, for the whole screen
   * (components/Crm/AllRefused.tsx). Repeating it here is four copies of one
   * fact. Only ever true when EVERY panel failed the same way -- a lone
   * broken panel says so in its own place, which is what this component is
   * for.
   */
  quiet?: boolean
}) {
  const { t } = useLanguage()
  return (
    <section className="crm__panel">
      <h3 className="crm__panel-title">{title}</h3>
      {state.reachable ? (
        children
      ) : quiet ? null : (
        <p className="crm__unreachable">
          {t('crm.unreachable')}
          {state.error ? `: ${state.error}` : ''}
        </p>
      )}
    </section>
  )
}
