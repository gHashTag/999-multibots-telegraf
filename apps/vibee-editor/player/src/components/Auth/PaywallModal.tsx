import { useAtomValue, useSetAtom } from 'jotai'
import { showPaywallAtom } from '@/atoms'
import { X } from 'lucide-react'
import './styles.css'

interface PaywallModalProps {
  onClose?: () => void
}

/** Defensive fallback if legacy code tries to open a payment surface. */
export function PaywallModal({ onClose }: PaywallModalProps) {
  const showPaywall = useAtomValue(showPaywallAtom)
  const setShowPaywall = useSetAtom(showPaywallAtom)

  if (!showPaywall) return null

  const close = () => {
    setShowPaywall(false)
    onClose?.()
  }

  return (
    <div className="paywall-overlay" onClick={close}>
      <div className="paywall-modal" onClick={event => event.stopPropagation()}>
        <button className="paywall-close" onClick={close} aria-label="Close">
          <X size={24} />
        </button>
        <div className="paywall-header">
          <h2>Payments are unavailable in SAFE BETA</h2>
          <p className="paywall-subtitle">
            This release cannot create invoices or charge an account.
          </p>
        </div>
      </div>
    </div>
  )
}
