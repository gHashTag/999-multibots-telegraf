import { useState } from 'react';
import './BuyVIBEE.css';

// VIBEE Token Sale Configuration
const VIBEE_CONFIG = {
  // Token addresses
  VIBEE_TOKEN: '0x01F4df1806220e3516c9030c8a4fddfda01b39a0',
  USDC_TOKEN: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  
  // Sale parameters
  RATE: 0.011, // 1 VIBEE = 0.011 USDC
  MIN_BUY_USDC: 100,
  MAX_BUY_USDC: 1089000,
  
  // Network
  CHAIN_ID: 42161, // Arbitrum One
  CHAIN_NAME: 'Arbitrum One',
  
  // XDAO Crowdfunding
  XDAO_URL: 'https://www.xdao.app/42161/dao/0xf27a274cf9fa7079d9a194c149e35969d6362dec/modules/crowdfunding',
};

export function BuyVIBEE() {
  const [usdcAmount, setUsdcAmount] = useState<string>('100');
  const [isConnecting, setIsConnecting] = useState(false);

  const vibeeAmount = usdcAmount ? Math.floor(parseFloat(usdcAmount) / VIBEE_CONFIG.RATE) : 0;
  const isValidAmount = parseFloat(usdcAmount) >= VIBEE_CONFIG.MIN_BUY_USDC && 
                        parseFloat(usdcAmount) <= VIBEE_CONFIG.MAX_BUY_USDC;

  const handleBuyClick = () => {
    // Redirect to XDAO for now
    window.open(VIBEE_CONFIG.XDAO_URL, '_blank');
  };

  const handleConnectWallet = async () => {
    setIsConnecting(true);
    try {
      // TODO: Implement WalletConnect/Reown integration
      // For now, redirect to XDAO
      window.open(VIBEE_CONFIG.XDAO_URL, '_blank');
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="buy-vibee">
      <div className="buy-vibee-header">
        <h2>Buy VIBEE Tokens</h2>
        <p className="buy-vibee-subtitle">
          Founder Round – 9.9% for $1.089M
        </p>
      </div>

      <div className="buy-vibee-stats">
        <div className="stat-item">
          <span className="stat-label">Price</span>
          <span className="stat-value">1 VIBEE = {VIBEE_CONFIG.RATE} USDC</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Min Purchase</span>
          <span className="stat-value">{VIBEE_CONFIG.MIN_BUY_USDC} USDC</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Max Purchase</span>
          <span className="stat-value">{VIBEE_CONFIG.MAX_BUY_USDC.toLocaleString()} USDC</span>
        </div>
      </div>

      <div className="buy-vibee-calculator">
        <div className="input-group">
          <label htmlFor="usdc-amount">You Pay (USDC)</label>
          <input
            id="usdc-amount"
            type="number"
            value={usdcAmount}
            onChange={(e) => setUsdcAmount(e.target.value)}
            min={VIBEE_CONFIG.MIN_BUY_USDC}
            max={VIBEE_CONFIG.MAX_BUY_USDC}
            step="10"
            placeholder="Enter USDC amount"
          />
          {!isValidAmount && usdcAmount && (
            <span className="input-error">
              Amount must be between {VIBEE_CONFIG.MIN_BUY_USDC} and {VIBEE_CONFIG.MAX_BUY_USDC.toLocaleString()} USDC
            </span>
          )}
        </div>

        <div className="conversion-arrow">↓</div>

        <div className="output-group">
          <label>You Receive (VIBEE)</label>
          <div className="output-value">
            {vibeeAmount.toLocaleString()} VIBEE
          </div>
        </div>
      </div>

      <div className="buy-vibee-actions">
        <button
          className="btn-buy-primary"
          onClick={handleBuyClick}
          disabled={!isValidAmount || isConnecting}
        >
          {isConnecting ? 'Connecting...' : 'Buy on XDAO'}
        </button>
        
        <p className="buy-vibee-note">
          Purchases are processed through XDAO's secure crowdfunding platform on Arbitrum One.
        </p>
      </div>

      <div className="buy-vibee-info">
        <h3>Sale Information</h3>
        <ul>
          <li><strong>Total Supply:</strong> 999,999,999 VIBEE</li>
          <li><strong>This Sale:</strong> 99,000,000 VIBEE (9.9%)</li>
          <li><strong>Target Raise:</strong> $1,089,000 USDC</li>
          <li><strong>Network:</strong> {VIBEE_CONFIG.CHAIN_NAME}</li>
          <li><strong>Vesting:</strong> 365 days linear</li>
        </ul>
      </div>

      <div className="buy-vibee-links">
        <a 
          href={`https://arbiscan.io/token/${VIBEE_CONFIG.VIBEE_TOKEN}`}
          target="_blank"
          rel="noopener noreferrer"
          className="link-secondary"
        >
          View Token Contract →
        </a>
        <a 
          href={VIBEE_CONFIG.XDAO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="link-secondary"
        >
          View on XDAO →
        </a>
      </div>
    </div>
  );
}

export default BuyVIBEE;
