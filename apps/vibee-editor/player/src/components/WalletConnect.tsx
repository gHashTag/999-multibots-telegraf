import { useWeb3Modal } from '@web3modal/wagmi/react';
import { useAccount, useDisconnect } from 'wagmi';
import { WALLET_CONNECT_PROJECT_ID } from '../config/web3';

interface WalletConnectButtonProps {
  className?: string;
}

export function WalletConnectButton({ className = '' }: WalletConnectButtonProps) {
  const { open } = useWeb3Modal();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  // If no project ID, show disabled button
  if (!WALLET_CONNECT_PROJECT_ID) {
    return (
      <button
        className={`wallet-connect-button wallet-connect-disabled ${className}`}
        disabled
        title="WalletConnect not configured"
      >
        Connect Wallet
      </button>
    );
  }

  if (isConnected && address) {
    const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return (
      <div className={`wallet-connected ${className}`}>
        <span className="wallet-address">{shortAddress}</span>
        <button
          className="wallet-disconnect-button"
          onClick={() => disconnect()}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      className={`wallet-connect-button ${className}`}
      onClick={() => open()}
    >
      Connect Wallet
    </button>
  );
}

export default WalletConnectButton;
