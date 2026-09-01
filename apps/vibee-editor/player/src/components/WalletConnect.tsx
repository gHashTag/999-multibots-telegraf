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
      title="Wallet payments are not available yet"
    >
      Connect Wallet
    </button>
  )
}

export default WalletConnectButton
