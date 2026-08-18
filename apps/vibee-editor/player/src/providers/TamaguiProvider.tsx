import { TamaguiProvider as TamaguiProviderCore, Theme } from '@tamagui/core'
import { config } from '../../tamagui.config'
import type { ReactNode } from 'react'

interface TamaguiProviderProps {
  children: ReactNode
}

/**
 * Tamagui Provider wrapper for the app.
 * Uses dark theme by default to match VIBEE brand.
 */
export function TamaguiProvider({ children }: TamaguiProviderProps) {
  return (
    <TamaguiProviderCore config={config} defaultTheme="dark">
      <Theme name="dark">
        {children}
      </Theme>
    </TamaguiProviderCore>
  )
}
