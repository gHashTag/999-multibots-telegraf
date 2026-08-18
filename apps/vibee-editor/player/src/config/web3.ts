// VIBEE Token Web3 Configuration
// Network: Arbitrum One

export const ARBITRUM_CHAIN_ID = 42161;

// Token Configuration
export const TOKEN_CONFIG = {
  name: 'VIBEE',
  symbol: 'VIBEE',
  decimals: 18,
  totalSupply: 999_999_999,
  // Address from Arbiscan
  address: '0x01f4df1806220e3516c9030c8a4fddfda01b39a0' as `0x${string}`,
};

// Tokenomics Distribution
export const TOKENOMICS = [
  {
    category: 'Founder',
    percentage: 90.1,
    tokens: 900_999_999,
    color: '#f59e0b', // amber
  },
  {
    category: 'Token Sale',
    percentage: 9.9,
    tokens: 99_000_000,
    color: '#3b82f6', // blue
  },
];

// Token Sale Configuration
export const TOKEN_SALE = {
  priceUSD: 0.011, // 1 VIBEE = 0.011 USDC
  totalRaiseUSD: 1_089_000, // ~$1.089M
  tokensForSale: 99_000_000,
};

// XDAO Configuration
export const XDAO_CONFIG = {
  daoUrl: 'https://www.xdao.app/42161/dao/0xf27a274cf9fa7079d9a194c149e35969d6362dec/modules/crowdfunding',
  treasuryAddress: '0xf27a274cf9fa7079d9a194c149e35969d6362dec' as `0x${string}`,
};

// WalletConnect Configuration
// Get your project ID at https://cloud.walletconnect.com
export const WALLET_CONNECT_PROJECT_ID = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID || '';

// DEX Links (Uniswap on Arbitrum)
export const DEX_CONFIG = {
  uniswapUrl: `https://app.uniswap.org/swap?chain=arbitrum&outputCurrency=${TOKEN_CONFIG.address}`,
};

// Arbiscan Links
export const ARBISCAN_CONFIG = {
  tokenUrl: `https://arbiscan.io/token/${TOKEN_CONFIG.address}`,
};

// Check if token is deployed
export const isTokenDeployed = (): boolean => {
  return TOKEN_CONFIG.address !== '' && TOKEN_CONFIG.address.startsWith('0x');
};

// Check if DAO is created
export const isDaoCreated = (): boolean => {
  return XDAO_CONFIG.daoUrl !== '';
};
