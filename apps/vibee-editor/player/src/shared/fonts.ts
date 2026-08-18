/**
 * Centralized Cyrillic Fonts Registry
 *
 * Single source of truth for all Cyrillic fonts used in captions.
 * Used by both Remotion compositions and Player UI.
 */

// ============================================================
// Types
// ============================================================

export type FontCategory = 'sans-serif' | 'serif' | 'monospace' | 'display' | 'handwriting';

export interface CyrillicFont {
  id: string;
  name: string;
  category: FontCategory;
}

// ============================================================
// Popular Fonts (shown first in dropdown)
// ============================================================

export const POPULAR_FONTS: CyrillicFont[] = [
  { id: 'Montserrat', name: 'Montserrat', category: 'sans-serif' },
  { id: 'Roboto', name: 'Roboto', category: 'sans-serif' },
  { id: 'OpenSans', name: 'Open Sans', category: 'sans-serif' },
  { id: 'PTSans', name: 'PT Sans', category: 'sans-serif' },
  { id: 'PTSerif', name: 'PT Serif', category: 'serif' },
  { id: 'Inter', name: 'Inter', category: 'sans-serif' },
  { id: 'Nunito', name: 'Nunito', category: 'sans-serif' },
  { id: 'Rubik', name: 'Rubik', category: 'sans-serif' },
  { id: 'FiraSans', name: 'Fira Sans', category: 'sans-serif' },
  { id: 'Ubuntu', name: 'Ubuntu', category: 'sans-serif' },
  { id: 'Comfortaa', name: 'Comfortaa', category: 'sans-serif' },
  { id: 'Jost', name: 'Jost', category: 'sans-serif' },
  { id: 'Manrope', name: 'Manrope', category: 'sans-serif' },
  { id: 'Raleway', name: 'Raleway', category: 'sans-serif' },
  { id: 'Oswald', name: 'Oswald', category: 'sans-serif' },
  { id: 'Lora', name: 'Lora', category: 'serif' },
  { id: 'Merriweather', name: 'Merriweather', category: 'serif' },
  { id: 'Bitter', name: 'Bitter', category: 'serif' },
  { id: 'SourceSans3', name: 'Source Sans 3', category: 'sans-serif' },
  { id: 'IBMPlexSans', name: 'IBM Plex Sans', category: 'sans-serif' },
  { id: 'Caveat', name: 'Caveat', category: 'handwriting' },
  { id: 'Pacifico', name: 'Pacifico', category: 'display' },
  { id: 'Lobster', name: 'Lobster', category: 'display' },
  { id: 'RussoOne', name: 'Russo One', category: 'display' },
  { id: 'PressStart2P', name: 'Press Start 2P', category: 'display' },
  { id: 'JetBrainsMono', name: 'JetBrains Mono', category: 'monospace' },
  { id: 'FiraCode', name: 'Fira Code', category: 'monospace' },
  { id: 'PlayfairDisplay', name: 'Playfair Display', category: 'serif' },
  { id: 'Cormorant', name: 'Cormorant', category: 'serif' },
  { id: 'Alice', name: 'Alice', category: 'serif' },
];

// ============================================================
// All Fonts (complete list for dropdown)
// ============================================================

export const ALL_CYRILLIC_FONTS: CyrillicFont[] = [
  // Popular fonts are included first
  ...POPULAR_FONTS,

  // Sans-serif
  { id: 'AdventPro', name: 'Advent Pro', category: 'sans-serif' },
  { id: 'Alatsi', name: 'Alatsi', category: 'sans-serif' },
  { id: 'AlegreyaSans', name: 'Alegreya Sans', category: 'sans-serif' },
  { id: 'AlumniSans', name: 'Alumni Sans', category: 'sans-serif' },
  { id: 'Arimo', name: 'Arimo', category: 'sans-serif' },
  { id: 'Arsenal', name: 'Arsenal', category: 'sans-serif' },
  { id: 'BalsamiqSans', name: 'Balsamiq Sans', category: 'sans-serif' },
  { id: 'Carlito', name: 'Carlito', category: 'sans-serif' },
  { id: 'Commissioner', name: 'Commissioner', category: 'sans-serif' },
  { id: 'Cuprum', name: 'Cuprum', category: 'sans-serif' },
  { id: 'DaysOne', name: 'Days One', category: 'sans-serif' },
  { id: 'DidactGothic', name: 'Didact Gothic', category: 'sans-serif' },
  { id: 'Exo2', name: 'Exo 2', category: 'sans-serif' },
  { id: 'Finlandica', name: 'Finlandica', category: 'sans-serif' },
  { id: 'FiraSansCondensed', name: 'Fira Sans Condensed', category: 'sans-serif' },
  { id: 'FjallaOne', name: 'Fjalla One', category: 'sans-serif' },
  { id: 'Geist', name: 'Geist', category: 'sans-serif' },
  { id: 'GolosText', name: 'Golos Text', category: 'sans-serif' },
  { id: 'GothicA1', name: 'Gothic A1', category: 'sans-serif' },
  { id: 'HankenGrotesk', name: 'Hanken Grotesk', category: 'sans-serif' },
  { id: 'InterTight', name: 'Inter Tight', category: 'sans-serif' },
  { id: 'IstokWeb', name: 'Istok Web', category: 'sans-serif' },
  { id: 'Jura', name: 'Jura', category: 'sans-serif' },
  { id: 'LibreFranklin', name: 'Libre Franklin', category: 'sans-serif' },
  { id: 'MerriweatherSans', name: 'Merriweather Sans', category: 'sans-serif' },
  { id: 'MontserratAlternates', name: 'Montserrat Alternates', category: 'sans-serif' },
  { id: 'Mulish', name: 'Mulish', category: 'sans-serif' },
  { id: 'NotoSans', name: 'Noto Sans', category: 'sans-serif' },
  { id: 'NunitoSans', name: 'Nunito Sans', category: 'sans-serif' },
  { id: 'Onest', name: 'Onest', category: 'sans-serif' },
  { id: 'Overpass', name: 'Overpass', category: 'sans-serif' },
  { id: 'Play', name: 'Play', category: 'sans-serif' },
  { id: 'PlusJakartaSans', name: 'Plus Jakarta Sans', category: 'sans-serif' },
  { id: 'PTSansCaption', name: 'PT Sans Caption', category: 'sans-serif' },
  { id: 'PTSansNarrow', name: 'PT Sans Narrow', category: 'sans-serif' },
  { id: 'Recursive', name: 'Recursive', category: 'sans-serif' },
  { id: 'RobotoCondensed', name: 'Roboto Condensed', category: 'sans-serif' },
  { id: 'RobotoFlex', name: 'Roboto Flex', category: 'sans-serif' },
  { id: 'Ruda', name: 'Ruda', category: 'sans-serif' },
  { id: 'Scada', name: 'Scada', category: 'sans-serif' },
  { id: 'SofiaSans', name: 'Sofia Sans', category: 'sans-serif' },
  { id: 'TenorSans', name: 'Tenor Sans', category: 'sans-serif' },
  { id: 'TikTokSans', name: 'TikTok Sans', category: 'sans-serif' },
  { id: 'UbuntuCondensed', name: 'Ubuntu Condensed', category: 'sans-serif' },
  { id: 'UbuntuSans', name: 'Ubuntu Sans', category: 'sans-serif' },
  { id: 'WixMadeforDisplay', name: 'Wix Madefor Display', category: 'sans-serif' },
  { id: 'YanoneKaffeesatz', name: 'Yanone Kaffeesatz', category: 'sans-serif' },

  // Serif
  { id: 'Alegreya', name: 'Alegreya', category: 'serif' },
  { id: 'BonaNova', name: 'Bona Nova', category: 'serif' },
  { id: 'Brygada1918', name: 'Brygada 1918', category: 'serif' },
  { id: 'CharisSIL', name: 'Charis SIL', category: 'serif' },
  { id: 'CormorantGaramond', name: 'Cormorant Garamond', category: 'serif' },
  { id: 'EBGaramond', name: 'EB Garamond', category: 'serif' },
  { id: 'Forum', name: 'Forum', category: 'serif' },
  { id: 'Gabriela', name: 'Gabriela', category: 'serif' },
  { id: 'GentiumPlus', name: 'Gentium Plus', category: 'serif' },
  { id: 'Kurale', name: 'Kurale', category: 'serif' },
  { id: 'Ledger', name: 'Ledger', category: 'serif' },
  { id: 'LibertinusSerif', name: 'Libertinus Serif', category: 'serif' },
  { id: 'Literata', name: 'Literata', category: 'serif' },
  { id: 'NotoSerif', name: 'Noto Serif', category: 'serif' },
  { id: 'OldStandardTT', name: 'Old Standard TT', category: 'serif' },
  { id: 'Oranienbaum', name: 'Oranienbaum', category: 'serif' },
  { id: 'Philosopher', name: 'Philosopher', category: 'serif' },
  { id: 'Piazzolla', name: 'Piazzolla', category: 'serif' },
  { id: 'Playfair', name: 'Playfair', category: 'serif' },
  { id: 'Podkova', name: 'Podkova', category: 'serif' },
  { id: 'Prata', name: 'Prata', category: 'serif' },
  { id: 'PTSerifCaption', name: 'PT Serif Caption', category: 'serif' },
  { id: 'RobotoSerif', name: 'Roboto Serif', category: 'serif' },
  { id: 'RobotoSlab', name: 'Roboto Slab', category: 'serif' },
  { id: 'SourceSerif4', name: 'Source Serif 4', category: 'serif' },
  { id: 'Spectral', name: 'Spectral', category: 'serif' },
  { id: 'Vollkorn', name: 'Vollkorn', category: 'serif' },
  { id: 'YesevaOne', name: 'Yeseva One', category: 'serif' },

  // Monospace
  { id: 'AnonymousPro', name: 'Anonymous Pro', category: 'monospace' },
  { id: 'CascadiaCode', name: 'Cascadia Code', category: 'monospace' },
  { id: 'Cousine', name: 'Cousine', category: 'monospace' },
  { id: 'FiraMono', name: 'Fira Mono', category: 'monospace' },
  { id: 'FragmentMono', name: 'Fragment Mono', category: 'monospace' },
  { id: 'GeistMono', name: 'Geist Mono', category: 'monospace' },
  { id: 'IBMPlexMono', name: 'IBM Plex Mono', category: 'monospace' },
  { id: 'NotoSansMono', name: 'Noto Sans Mono', category: 'monospace' },
  { id: 'OverpassMono', name: 'Overpass Mono', category: 'monospace' },
  { id: 'PTMono', name: 'PT Mono', category: 'monospace' },
  { id: 'RobotoMono', name: 'Roboto Mono', category: 'monospace' },
  { id: 'SourceCodePro', name: 'Source Code Pro', category: 'monospace' },
  { id: 'UbuntuMono', name: 'Ubuntu Mono', category: 'monospace' },
  { id: 'VictorMono', name: 'Victor Mono', category: 'monospace' },

  // Display
  { id: 'AmaticSC', name: 'Amatic SC', category: 'display' },
  { id: 'BlackOpsOne', name: 'Black Ops One', category: 'display' },
  { id: 'DelaGothicOne', name: 'Dela Gothic One', category: 'display' },
  { id: 'DynaPuff', name: 'DynaPuff', category: 'display' },
  { id: 'Fruktur', name: 'Fruktur', category: 'display' },
  { id: 'Gloock', name: 'Gloock', category: 'display' },
  { id: 'KellySlab', name: 'Kelly Slab', category: 'display' },
  { id: 'Nabla', name: 'Nabla', category: 'display' },
  { id: 'OrelegaOne', name: 'Orelega One', category: 'display' },
  { id: 'PixelifySans', name: 'Pixelify Sans', category: 'display' },
  { id: 'PoiretOne', name: 'Poiret One', category: 'display' },
  { id: 'ProstoOne', name: 'Prosto One', category: 'display' },
  { id: 'RubikBubbles', name: 'Rubik Bubbles', category: 'display' },
  { id: 'RubikGlitch', name: 'Rubik Glitch', category: 'display' },
  { id: 'RubikMonoOne', name: 'Rubik Mono One', category: 'display' },
  { id: 'RuslanDisplay', name: 'Ruslan Display', category: 'display' },
  { id: 'SeymourOne', name: 'Seymour One', category: 'display' },
  { id: 'StalinistOne', name: 'Stalinist One', category: 'display' },
  { id: 'Unbounded', name: 'Unbounded', category: 'display' },

  // Handwriting
  { id: 'BadScript', name: 'Bad Script', category: 'handwriting' },
  { id: 'Bellota', name: 'Bellota', category: 'handwriting' },
  { id: 'ComicRelief', name: 'Comic Relief', category: 'handwriting' },
  { id: 'Comforter', name: 'Comforter', category: 'handwriting' },
  { id: 'GreatVibes', name: 'Great Vibes', category: 'handwriting' },
  { id: 'MarckScript', name: 'Marck Script', category: 'handwriting' },
  { id: 'Neucha', name: 'Neucha', category: 'handwriting' },
  { id: 'Pangolin', name: 'Pangolin', category: 'handwriting' },
  { id: 'ShantellSans', name: 'Shantell Sans', category: 'handwriting' },
  { id: 'Underdog', name: 'Underdog', category: 'handwriting' },
];

// Deduplicated list
export const UNIQUE_FONTS: CyrillicFont[] = ALL_CYRILLIC_FONTS.filter(
  (font, index, self) => index === self.findIndex((f) => f.id === font.id)
);

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get font by ID
 */
export function getFontById(fontId: string): CyrillicFont | undefined {
  return UNIQUE_FONTS.find((f) => f.id === fontId);
}

/**
 * Get fonts by category
 */
export function getFontsByCategory(category: FontCategory): CyrillicFont[] {
  return UNIQUE_FONTS.filter((f) => f.category === category);
}

/**
 * Search fonts by name or ID
 */
export function searchFonts(query: string): CyrillicFont[] {
  const lowerQuery = query.toLowerCase();
  return UNIQUE_FONTS.filter(
    (f) =>
      f.name.toLowerCase().includes(lowerQuery) ||
      f.id.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Check if font is in popular list
 */
export function isPopularFont(fontId: string): boolean {
  return POPULAR_FONTS.some((f) => f.id === fontId);
}

/**
 * Get default font ID
 */
export const DEFAULT_FONT_ID = 'Montserrat';

/**
 * Total number of available fonts
 */
export const TOTAL_FONTS = UNIQUE_FONTS.length;
