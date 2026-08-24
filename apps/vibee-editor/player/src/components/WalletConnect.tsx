interface WalletConnectButtonProps {
  className?: string
}

export function WalletConnectButton({
  className = '',
}: WalletConnectButtonProps) {
  return (
    <button
      className={`wallet-connect-button wallet-connect-disabled ${className}`}
      disabled
      title="Payments unavailable in SAFE BETA"
    >
      Payments unavailable in SAFE BETA
    </button>
  )
}

export default WalletConnectButton
