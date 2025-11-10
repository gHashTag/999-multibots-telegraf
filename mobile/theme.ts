/**
 * Vibee Mobile Theme
 * Фирменный стиль из 999-web адаптированный для React Native
 */

export const colors = {
  // Основные бренд-цвета (желтый/золотой)
  brand: {
    DEFAULT: '#f6ff00',      // Яркий желтый
    light: '#ffea00',        // Светлый желтый
    dim: '#c4cc00',          // Приглушенный желтый
    gold: '#C6A94C',         // Золотой
    goldLight: '#D4B55F',    // Светлое золото
    goldDark: '#B8941F',     // Темное золото
  },

  // Фоновые цвета (темная тема)
  background: {
    main: '#0c0a09',         // Основной черный фон
    card: '#141210',         // Фон карточек
    hover: '#1a1815',        // Фон при наведении
    gradient: '#1a1816',     // Для градиентов
  },

  // Границы
  border: {
    brown: '#3b2a13',        // Коричневая граница
    yellow: '#f6ff00',       // Желтая граница
    yellowDim: 'rgba(246, 255, 0, 0.2)',  // Приглушенная желтая
  },

  // Текст
  text: {
    primary: '#fff',         // Белый
    secondary: '#c9c9d3',    // Светло-серый
    muted: '#8b8ba7',        // Приглушенный серый
    yellow: '#f6ff00',       // Желтый текст
  },

  // Состояния
  success: 'hsl(142, 76%, 36%)',
  warning: 'hsl(38, 92%, 50%)',
  destructive: 'hsl(0, 84.2%, 60.2%)',

  // Дополнительные
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
  '6xl': 60,
};

export const fontWeight = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

export const shadows = {
  sm: {
    shadowColor: colors.brand.DEFAULT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: colors.brand.DEFAULT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: colors.brand.DEFAULT,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: colors.brand.DEFAULT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
};

export const gradients = {
  yellow: ['#f6ff00', '#ffea00'],
  dark: ['#0c0a09', '#1a1816', '#0c0a09'],
  gold: ['#C6A94C', '#D4B55F'],
};

export const theme = {
  colors,
  spacing,
  borderRadius,
  fontSize,
  fontWeight,
  shadows,
  gradients,
};

export default theme;
