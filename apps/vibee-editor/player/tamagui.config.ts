import { createTamagui, createTokens, createFont } from '@tamagui/core'

// Font configuration
const systemFont = createFont({
  family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif',
  size: {
    1: 11,
    2: 12,
    3: 13,
    4: 14,
    5: 16,
    6: 18,
    7: 20,
    8: 24,
    9: 32,
    10: 40,
  },
  lineHeight: {
    1: 14,
    2: 16,
    3: 18,
    4: 20,
    5: 24,
    6: 26,
    7: 28,
    8: 32,
    9: 40,
    10: 48,
  },
  weight: {
    4: '400',
    5: '500',
    6: '600',
    7: '700',
  },
  letterSpacing: {
    4: 0,
    5: 0,
    6: -0.2,
    7: -0.3,
  },
})

// Tokens from CSS variables (index.css)
const tokens = createTokens({
  color: {
    // VIBEE brand colors (from --vibee-*)
    vibeeAmber: '#f59e0b',
    vibeeAmberLight: '#fbbf24',
    vibeeAmberDark: '#d97706',
    vibeeBg: '#0a0a0a',
    vibeeBgElevated: '#111111',
    vibeeBorder: '#1a1a1a',
    vibeeBorderLight: '#2a2a2a',

    // Base colors
    white: '#ffffff',
    black: '#000000',
    transparent: 'transparent',

    // Grays (for text, borders, etc.)
    gray50: '#fafafa',
    gray100: '#f5f5f5',
    gray200: '#e5e5e5',
    gray300: '#d4d4d4',
    gray400: '#a3a3a3',
    gray500: '#737373',
    gray600: '#525252',
    gray700: '#404040',
    gray800: '#262626',
    gray900: '#171717',

    // Status colors
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
  },

  space: {
    // Numeric scale (matching Tailwind)
    0: 0,
    0.5: 2,
    1: 4,
    1.5: 6,
    2: 8,
    2.5: 10,
    3: 12,
    3.5: 14,
    4: 16,
    5: 20,
    6: 24,
    7: 28,
    8: 32,
    9: 36,
    10: 40,
    11: 44,
    12: 48,
    14: 56,
    16: 64,
    20: 80,
    24: 96,

    // Named (from CSS variables)
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    '2xl': 48,

    // Negative values for margins
    '-1': -4,
    '-2': -8,
    '-3': -12,
    '-4': -16,

    // Special values
    true: 16, // default
  },

  size: {
    0: 0,
    0.5: 2,
    1: 4,
    1.5: 6,
    2: 8,
    2.5: 10,
    3: 12,
    3.5: 14,
    4: 16,
    5: 20,
    6: 24,
    7: 28,
    8: 32,
    9: 36,
    10: 40,
    11: 44,
    12: 48,
    14: 56,
    16: 64,
    20: 80,
    24: 96,

    // Component sizes
    touchTarget: 44, // WCAG 2.2 AA
    touchTargetSm: 36,
    headerHeight: 56,
    navHeight: 64,

    // Layout (from CSS variables)
    sidebarWidth: 320,
    sidebarRightWidth: 350,
    timelineHeight: 200,

    true: 16,
  },

  radius: {
    0: 0,
    1: 2,
    2: 4,
    3: 6,
    4: 8,
    5: 10,
    6: 12,
    7: 14,
    8: 16,
    9: 20,
    10: 24,
    full: 9999,

    // Named
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,

    true: 8,
  },

  zIndex: {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,

    // Named (from CSS variables)
    timeline: 40,
    sidebar: 45,
    nav: 50,
    bottomsheet: 60,
    modal: 100,
    toast: 110,
  },
})

// Theme definitions
const darkTheme = {
  // Background colors
  background: tokens.color.vibeeBg,
  backgroundHover: tokens.color.vibeeBgElevated,
  backgroundPress: tokens.color.gray800,
  backgroundFocus: tokens.color.vibeeBgElevated,
  backgroundStrong: tokens.color.black,
  backgroundTransparent: tokens.color.transparent,

  // Text colors
  color: tokens.color.white,
  colorHover: tokens.color.gray100,
  colorPress: tokens.color.gray200,
  colorFocus: tokens.color.white,
  colorTransparent: 'rgba(255,255,255,0)',

  // Border colors
  borderColor: tokens.color.vibeeBorder,
  borderColorHover: tokens.color.vibeeBorderLight,
  borderColorFocus: tokens.color.vibeeAmber,
  borderColorPress: tokens.color.vibeeBorder,

  // Placeholder
  placeholderColor: tokens.color.gray500,

  // Shadows
  shadowColor: 'rgba(0,0,0,0.5)',
  shadowColorHover: 'rgba(0,0,0,0.6)',

  // Brand colors (semantic)
  primary: tokens.color.vibeeAmber,
  primaryHover: tokens.color.vibeeAmberLight,
  primaryPress: tokens.color.vibeeAmberDark,

  // Status colors
  success: tokens.color.success,
  error: tokens.color.error,
  warning: tokens.color.warning,
  info: tokens.color.info,

  // Surface colors (for cards, panels)
  surface: tokens.color.vibeeBgElevated,
  surfaceHover: tokens.color.gray800,

  // Muted colors
  muted: tokens.color.gray500,
  mutedForeground: tokens.color.gray400,

  // Accent
  accent: tokens.color.vibeeAmber,
  accentForeground: tokens.color.black,
}

// Create Tamagui config
export const config = createTamagui({
  tokens,
  themes: {
    dark: darkTheme,
    // Light theme can be added later if needed
    light: {
      ...darkTheme,
      background: tokens.color.white,
      color: tokens.color.gray900,
      borderColor: tokens.color.gray200,
      surface: tokens.color.gray50,
    },
  },
  fonts: {
    heading: systemFont,
    body: systemFont,
    mono: createFont({
      family: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      size: systemFont.size,
      lineHeight: systemFont.lineHeight,
      weight: systemFont.weight,
      letterSpacing: systemFont.letterSpacing,
    }),
  },
  // Responsive breakpoints (matching existing useMediaQuery hooks)
  media: {
    xs: { maxWidth: 479 },
    sm: { maxWidth: 767 },
    md: { maxWidth: 1023 },
    lg: { maxWidth: 1279 },
    xl: { maxWidth: 1535 },
    xxl: { minWidth: 1536 },
    // Shortcuts
    mobile: { maxWidth: 767 },
    tablet: { minWidth: 768, maxWidth: 1023 },
    desktop: { minWidth: 1024 },
    // Feature queries
    pointerCoarse: { pointer: 'coarse' }, // Touch devices
    pointerFine: { pointer: 'fine' },     // Mouse devices
  },
  // Shorthands for faster typing
  shorthands: {
    // Layout
    w: 'width',
    h: 'height',
    m: 'margin',
    p: 'padding',
    mt: 'marginTop',
    mr: 'marginRight',
    mb: 'marginBottom',
    ml: 'marginLeft',
    mx: 'marginHorizontal',
    my: 'marginVertical',
    pt: 'paddingTop',
    pr: 'paddingRight',
    pb: 'paddingBottom',
    pl: 'paddingLeft',
    px: 'paddingHorizontal',
    py: 'paddingVertical',

    // Flexbox
    f: 'flex',
    fd: 'flexDirection',
    fw: 'flexWrap',
    ai: 'alignItems',
    ac: 'alignContent',
    jc: 'justifyContent',
    as: 'alignSelf',
    fg: 'flexGrow',
    fs: 'flexShrink',
    fb: 'flexBasis',

    // Sizing
    miw: 'minWidth',
    maw: 'maxWidth',
    mih: 'minHeight',
    mah: 'maxHeight',

    // Borders
    br: 'borderRadius',
    bw: 'borderWidth',
    bc: 'borderColor',
    btw: 'borderTopWidth',
    brw: 'borderRightWidth',
    bbw: 'borderBottomWidth',
    blw: 'borderLeftWidth',
    btlr: 'borderTopLeftRadius',
    btrr: 'borderTopRightRadius',
    bbrr: 'borderBottomRightRadius',
    bblr: 'borderBottomLeftRadius',

    // Colors
    bg: 'backgroundColor',
    col: 'color',
    o: 'opacity',

    // Position
    pos: 'position',
    t: 'top',
    r: 'right',
    b: 'bottom',
    l: 'left',
    zi: 'zIndex',

    // Transform
    x: 'translateX',
    y: 'translateY',
    scale: 'scale',
    rotate: 'rotate',

    // Text
    ta: 'textAlign',
    lh: 'lineHeight',
    fow: 'fontWeight',
    fos: 'fontSize',
    ff: 'fontFamily',
  } as const,

  // Settings
  settings: {
    // Allow style props at any breakpoint
    allowedStyleValues: 'somewhat-strict-web',
    // Fast mode for better performance
    fastSchemeChange: true,
  },
})
