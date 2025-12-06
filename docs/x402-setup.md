# x402 Crypto Payment Setup Guide

## Overview

x402 enables USDC payments on Base network with:
- HTTP 402 Payment Required flow
- 2-second settlement
- Zero transaction fees
- ERC-3009 gasless transfers

## Environment Configuration

### Development (Base Sepolia Testnet)

```bash
# In .env (local) or Infisical (dev):
X402_WALLET_ADDRESS=0x0A91540efd651E8fbeb91FA5c6c31D7c20897C18
X402_NETWORK=base-sepolia
X402_FACILITATOR_URL=https://x402.org/facilitator
BASE_WEBHOOK_URL=https://<your-tunnel>.trycloudflare.com
```

### Production (Base Mainnet)

```bash
# In Infisical (prod environment):
X402_WALLET_ADDRESS=0x0A91540efd651E8fbeb91FA5c6c31D7c20897C18  # Same wallet
X402_NETWORK=base-mainnet
X402_FACILITATOR_URL=https://x402.org/facilitator
BASE_WEBHOOK_URL=https://your-production-domain.com
```

## Adding Secrets to Infisical

```bash
# Login to Infisical
infisical login

# Add secrets for development
infisical secrets set X402_WALLET_ADDRESS=0x0A91540efd651E8fbeb91FA5c6c31D7c20897C18 --env=dev
infisical secrets set X402_NETWORK=base-sepolia --env=dev
infisical secrets set X402_FACILITATOR_URL=https://x402.org/facilitator --env=dev

# Add secrets for production
infisical secrets set X402_WALLET_ADDRESS=0x0A91540efd651E8fbeb91FA5c6c31D7c20897C18 --env=prod
infisical secrets set X402_NETWORK=base-mainnet --env=prod
infisical secrets set X402_FACILITATOR_URL=https://x402.org/facilitator --env=prod
```

## Network Details

### Base Sepolia (Testnet)
- Chain ID: 84532
- RPC URL: https://sepolia.base.org
- USDC Contract: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
- Explorer: https://sepolia.basescan.org

### Base Mainnet
- Chain ID: 8453
- RPC URL: https://mainnet.base.org
- USDC Contract: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
- Explorer: https://basescan.org

## Getting Test USDC

For development on Base Sepolia:
1. Go to https://faucet.circle.com/
2. Select "Base Sepolia" network
3. Enter your wallet address
4. Receive free test USDC

## Wallet Setup

1. Use MetaMask, Coinbase Wallet, or any EVM wallet
2. Add Base network to your wallet
3. For testnet: Add Base Sepolia chain
4. For mainnet: Add Base chain
5. Import USDC token using the contract address above

## Payment Flow

1. User selects "Crypto" payment in Telegram bot
2. User selects top-up amount (e.g., $10 = 434 stars)
3. Bot generates payment URL with parameters
4. User opens URL in browser
5. Browser shows payment page (black/yellow design)
6. User connects wallet (MetaMask, Coinbase, etc.)
7. User signs USDC transfer
8. Server verifies transaction and credits balance
9. User receives notification in Telegram

## Pricing Structure

| USD | Stars | Approx RUB |
|-----|-------|------------|
| $5  | 217   | ~500₽      |
| $10 | 434   | ~1000₽     |
| $25 | 1085  | ~2500₽     |
| $50 | 2170  | ~5000₽     |
| $100| 4340  | ~10000₽    |

## Troubleshooting

### "Wallet not found" error
- User needs to install MetaMask or Coinbase Wallet
- The page must be opened in a browser with wallet extension

### "Network switch failed"
- User may need to manually add Base network to wallet
- Provide network details above

### "Insufficient USDC"
- User needs to have enough USDC in their wallet
- On testnet: Use the faucet to get free USDC
- On mainnet: User needs to buy USDC

### Transaction stuck
- Check gas fees (need small ETH for gas on Base)
- On testnet: Get free ETH from Base Sepolia faucet

## Security Notes

1. Never share private keys or seed phrases
2. All payments verified via blockchain
3. Idempotent payments (inv_id prevents duplicates)
4. HTTPS required for all endpoints
5. Payment page includes CSRF protection
