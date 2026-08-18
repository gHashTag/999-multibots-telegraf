import { Globe, Send, Instagram, Twitter, Youtube } from 'lucide-react';
import type { SocialLink } from '@/atoms';
import { BRAND_COLORS } from '@vibee/atoms';

// TikTok icon (not in lucide-react)
const TikTokIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
  </svg>
);

interface SocialLinksProps {
  links: SocialLink[];
}

const PLATFORM_ICONS: Record<SocialLink['platform'], React.ReactNode> = {
  telegram: <Send size={18} />,
  instagram: <Instagram size={18} />,
  twitter: <Twitter size={18} />,
  youtube: <Youtube size={18} />,
  tiktok: <TikTokIcon />,
  website: <Globe size={18} />,
};

const PLATFORM_COLORS: Record<SocialLink['platform'], string> = {
  telegram: '#0088cc',
  instagram: '#E1306C',
  twitter: '#1DA1F2',
  youtube: '#FF0000',
  tiktok: '#000000',
  website: BRAND_COLORS.amber,
};

export function SocialLinks({ links }: SocialLinksProps) {
  if (!links || links.length === 0) return null;

  return (
    <div className="social-links">
      {links.map((link, index) => (
        <a
          key={`${link.platform}-${index}`}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="social-links__item"
          title={link.label || link.platform}
          style={{ '--platform-color': PLATFORM_COLORS[link.platform] } as React.CSSProperties}
        >
          {PLATFORM_ICONS[link.platform]}
        </a>
      ))}
    </div>
  );
}
