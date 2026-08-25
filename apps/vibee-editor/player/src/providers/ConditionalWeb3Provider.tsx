import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Web3Provider } from './Web3Provider';

interface ConditionalWeb3ProviderProps {
  children: ReactNode;
}

// Pages that DON'T need Web3
const WEB3_EXCLUDED_ROUTES = [
  '/learn',
  '/privacy-policy',
  '/terms-service',
  '/terms-of-service',
];

export function ConditionalWeb3Provider({ children }: ConditionalWeb3ProviderProps) {
  const location = useLocation();
  
  // Check if current route needs Web3
  const needsWeb3 = !WEB3_EXCLUDED_ROUTES.some(route => 
    location.pathname.startsWith(route)
  );

  // Only wrap with Web3Provider if needed
  if (needsWeb3) {
    return <Web3Provider>{children}</Web3Provider>;
  }

  // Return children without Web3Provider
  return <>{children}</>;
}
