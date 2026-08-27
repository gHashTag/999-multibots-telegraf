interface WalletConnectButtonProps {
  className?: string;
}

export function WalletConnectButton({ className = '' }: WalletConnectButtonProps) {
  return (
    <button
      className={`wallet-connect-button wallet-connect-disabled ${className}`}
      disabled
      title="Wallet connection is not available"
    >
      Connect Wallet
    </button>
  );
}

export default WalletConnectButton;
