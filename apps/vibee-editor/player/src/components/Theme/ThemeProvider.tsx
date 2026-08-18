// ===============================
// Theme Provider
// Applies theme to document
// ===============================

import { useEffect } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { resolvedThemeAtom, systemThemeAtom } from '@/atoms/theme';
import type { ResolvedTheme } from '@/atoms/theme';
import { BG_COLORS } from '@vibee/atoms';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [resolvedTheme] = useAtom(resolvedThemeAtom);
  const setSystemTheme = useSetAtom(systemThemeAtom);

  // Detect system theme
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const updateSystemTheme = (e: MediaQueryListEvent | MediaQueryList) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    // Set initial value
    updateSystemTheme(mediaQuery);

    // Listen for changes
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', updateSystemTheme);
      return () => mediaQuery.removeEventListener('change', updateSystemTheme);
    }

    // Legacy browsers
    mediaQuery.addListener(updateSystemTheme);
    return () => mediaQuery.removeListener(updateSystemTheme);
  }, [setSystemTheme]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;

    // Remove old theme class
    root.classList.remove('light', 'dark');

    // Add new theme class
    root.classList.add(resolvedTheme);

    // Update color-scheme for native elements
    root.style.colorScheme = resolvedTheme;

    // Update meta theme-color
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute(
        'content',
        resolvedTheme === 'dark' ? BG_COLORS.primary : '#ffffff'
      );
    }
  }, [resolvedTheme]);

  return <>{children}</>;
}

// Theme toggle button component
import { Sun, Moon, Monitor } from 'lucide-react';
import { themeModeAtom } from '@/atoms/theme';
import type { ThemeMode } from '@/atoms/theme';
import { useHaptic } from '@/hooks/useHaptic';
import './ThemeToggle.css';

const ICONS: Record<ThemeMode, React.ReactNode> = {
  light: <Sun size={20} />,
  dark: <Moon size={20} />,
  system: <Monitor size={20} />,
};

const LABELS: Record<ThemeMode, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const [mode, setMode] = useAtom(themeModeAtom);
  const { selection } = useHaptic();

  const cycle = () => {
    selection();
    const next: ThemeMode =
      mode === 'system' ? 'light' :
      mode === 'light' ? 'dark' : 'system';
    setMode(next);
  };

  return (
    <button className="theme-toggle" onClick={cycle} title={`Theme: ${LABELS[mode]}`}>
      <span className="theme-toggle__icon">{ICONS[mode]}</span>
      {showLabel && <span className="theme-toggle__label">{LABELS[mode]}</span>}
    </button>
  );
}
