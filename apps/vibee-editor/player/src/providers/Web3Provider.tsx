import { WagmiProvider, createConfig, http } from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';

// Setup queryClient
const queryClient = new QueryClient();

const chains = [arbitrum] as const;

// Minimal wagmi config — no WalletConnect/Web3Modal eager initialization.
// Web3Modal was causing 403 errors on api.web3modal.org because the project
// needs domain whitelisting at https://cloud.walletconnect.com.
// TODO: Re-enable createWeb3Modal after configuring the WalletConnect project.
const config = createConfig({
  chains,
  transports: { [arbitrum.id]: http() },
});

interface Web3ProviderProps {
  children: ReactNode;
}

export function Web3Provider({ children }: Web3ProviderProps) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default Web3Provider;
