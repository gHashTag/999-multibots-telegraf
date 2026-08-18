import {
  TOKEN_CONFIG,
  TOKENOMICS,
  TOKEN_SALE,
  XDAO_CONFIG,
  ARBISCAN_CONFIG,
  DEX_CONFIG,
  isTokenDeployed,
  isDaoCreated,
} from '../config/web3';
import { WalletConnectButton } from './WalletConnect';

interface TokenomicsSectionProps {
  lang: 'en' | 'ru';
}

const translations = {
  en: {
    title: 'VIBEE Token',
    subtitle: 'Join the future of AI-first development',
    network: 'Network',
    totalSupply: 'Total Supply',
    tokenSale: 'Token Sale',
    pricePerToken: 'Price per Token',
    buyToken: 'Buy Token',
    joinDao: 'Join DAO',
    comingSoon: 'Coming Soon',
    tokenNotDeployed: 'Token not yet deployed',
    daoNotCreated: 'DAO coming soon',
    distribution: 'Distribution',
    founder: 'Founder',
    sale: 'Token Sale',
  },
  ru: {
    title: 'Токен VIBEE',
    subtitle: 'Присоединяйтесь к будущему AI-разработки',
    network: 'Arbitrum One',
    totalSupply: 'Общий объём',
    tokenSale: 'Продажа токенов',
    pricePerToken: 'Цена за токен',
    buyToken: 'Купить токен',
    joinDao: 'Войти в DAO',
    comingSoon: 'Скоро',
    tokenNotDeployed: 'Токен ещё не развёрнут',
    daoNotCreated: 'DAO скоро появится',
    distribution: 'Распределение',
    founder: 'Основатель',
    sale: 'Продажа',
  },
};

export function TokenomicsSection({ lang }: TokenomicsSectionProps) {
  const t = translations[lang];
  const tokenDeployed = isTokenDeployed();
  const daoCreated = isDaoCreated();

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat(lang === 'ru' ? 'ru-RU' : 'en-US').format(num);
  };

  return (
    <section className="tokenomics-section">
      <div className="tokenomics-container">
        {/* Header */}
        <div className="tokenomics-header">
          <h2 className="tokenomics-title">{t.title}</h2>
          <p className="tokenomics-subtitle">{t.subtitle}</p>
          <WalletConnectButton className="tokenomics-wallet-btn" />
        </div>

        {/* Main Content - Grid Layout */}
        <div className="tokenomics-content">
          {/* Distribution Grid */}
          <div className="tokenomics-distribution">
            {TOKENOMICS.map((item) => (
              <div 
                key={item.category} 
                className="distribution-item"
                style={{ borderColor: item.color }}
              >
                <div className="distribution-bar">
                  <div 
                    className="distribution-fill"
                    style={{ 
                      width: `${item.percentage}%`,
                      backgroundColor: item.color
                    }}
                  />
                </div>
                <div className="distribution-info">
                  <span className="distribution-category">
                    {lang === 'ru'
                      ? (item.category === 'Founder' ? t.founder : t.sale)
                      : item.category
                    }
                  </span>
                  <span className="distribution-percentage" style={{ color: item.color }}>
                    {item.percentage}%
                  </span>
                  <span className="distribution-tokens">
                    {formatNumber(item.tokens)} {TOKEN_CONFIG.symbol}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Token Info Grid */}
          <div className="tokenomics-info">
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">{t.network}</span>
                <span className="info-value">{lang === "ru" ? "Arbitrum One" : "Arbitrum One"}</span>
              </div>
              <div className="info-item">
                <span className="info-label">{t.totalSupply}</span>
                <span className="info-value">
                  {formatNumber(TOKEN_CONFIG.totalSupply)} {TOKEN_CONFIG.symbol}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">{t.tokenSale}</span>
                <span className="info-value">
                  {formatNumber(TOKEN_SALE.tokensForSale)} {TOKEN_CONFIG.symbol}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">{t.pricePerToken}</span>
                <span className="info-value">${TOKEN_SALE.priceUSD}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="tokenomics-actions">
              {tokenDeployed ? (
                <a
                  href={XDAO_CONFIG.daoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="token-action-btn primary"
                >
                  {t.buyToken}
                </a>
              ) : (
                <button className="token-action-btn primary disabled" disabled>
                  {t.buyToken}
                  <span className="btn-tooltip">{t.tokenNotDeployed}</span>
                </button>
              )}

              {daoCreated ? (
                <a
                  href={ARBISCAN_CONFIG.tokenUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="token-action-btn secondary"
                >
                  {t.joinDao}
                </a>
              ) : (
                <button className="token-action-btn secondary disabled" disabled>
                  {t.joinDao}
                  <span className="btn-tooltip">{t.daoNotCreated}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default TokenomicsSection;
