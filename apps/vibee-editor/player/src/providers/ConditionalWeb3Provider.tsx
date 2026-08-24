import type { ReactNode } from 'react'

interface ConditionalWeb3ProviderProps {
  children: ReactNode
}

export function ConditionalWeb3Provider({
  children,
}: ConditionalWeb3ProviderProps) {
  return <>{children}</>
}
