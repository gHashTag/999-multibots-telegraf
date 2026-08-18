/**
 * Cyrillic Fonts Loader for Remotion
 *
 * This module handles dynamic font loading for Remotion compositions.
 * Font definitions are imported from the shared module.
 */

// Re-export everything from shared fonts module
export * from '../shared/fonts';

// Import types
import { DEFAULT_FONT_ID } from '../shared/fonts';

// ============================================================
// Font Loading (Remotion-specific)
// ============================================================

// Font cache for loaded fonts
const fontCache: Map<string, string> = new Map();

// Static imports for fonts that can be dynamically loaded
// (webpack requires static import paths)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FONT_LOADERS: Record<string, () => Promise<any>> = {
  // Popular fonts
  Montserrat: () => import('@remotion/google-fonts/Montserrat'),
  Roboto: () => import('@remotion/google-fonts/Roboto'),
  OpenSans: () => import('@remotion/google-fonts/OpenSans'),
  PTSans: () => import('@remotion/google-fonts/PTSans'),
  PTSerif: () => import('@remotion/google-fonts/PTSerif'),
  Inter: () => import('@remotion/google-fonts/Inter'),
  Nunito: () => import('@remotion/google-fonts/Nunito'),
  Rubik: () => import('@remotion/google-fonts/Rubik'),
  FiraSans: () => import('@remotion/google-fonts/FiraSans'),
  Ubuntu: () => import('@remotion/google-fonts/Ubuntu'),
  Comfortaa: () => import('@remotion/google-fonts/Comfortaa'),
  Jost: () => import('@remotion/google-fonts/Jost'),
  Manrope: () => import('@remotion/google-fonts/Manrope'),
  Raleway: () => import('@remotion/google-fonts/Raleway'),
  Oswald: () => import('@remotion/google-fonts/Oswald'),
  Lora: () => import('@remotion/google-fonts/Lora'),
  Merriweather: () => import('@remotion/google-fonts/Merriweather'),
  Bitter: () => import('@remotion/google-fonts/Bitter'),
  SourceSans3: () => import('@remotion/google-fonts/SourceSans3'),
  IBMPlexSans: () => import('@remotion/google-fonts/IBMPlexSans'),
  Caveat: () => import('@remotion/google-fonts/Caveat'),
  Pacifico: () => import('@remotion/google-fonts/Pacifico'),
  Lobster: () => import('@remotion/google-fonts/Lobster'),
  RussoOne: () => import('@remotion/google-fonts/RussoOne'),
  PressStart2P: () => import('@remotion/google-fonts/PressStart2P'),
  JetBrainsMono: () => import('@remotion/google-fonts/JetBrainsMono'),
  FiraCode: () => import('@remotion/google-fonts/FiraCode'),
  PlayfairDisplay: () => import('@remotion/google-fonts/PlayfairDisplay'),
  Cormorant: () => import('@remotion/google-fonts/Cormorant'),
  Alice: () => import('@remotion/google-fonts/Alice'),

  // Additional fonts
  NotoSans: () => import('@remotion/google-fonts/NotoSans'),
  NotoSerif: () => import('@remotion/google-fonts/NotoSerif'),
  Mulish: () => import('@remotion/google-fonts/Mulish'),
  Play: () => import('@remotion/google-fonts/Play'),
  Exo2: () => import('@remotion/google-fonts/Exo2'),
  Unbounded: () => import('@remotion/google-fonts/Unbounded'),
  Cuprum: () => import('@remotion/google-fonts/Cuprum'),
  Philosopher: () => import('@remotion/google-fonts/Philosopher'),
  AmaticSC: () => import('@remotion/google-fonts/AmaticSC'),
  PoiretOne: () => import('@remotion/google-fonts/PoiretOne'),
  BadScript: () => import('@remotion/google-fonts/BadScript'),
  Neucha: () => import('@remotion/google-fonts/Neucha'),
  MarckScript: () => import('@remotion/google-fonts/MarckScript'),
  RobotoMono: () => import('@remotion/google-fonts/RobotoMono'),
  RobotoSlab: () => import('@remotion/google-fonts/RobotoSlab'),
  PTMono: () => import('@remotion/google-fonts/PTMono'),
  UbuntuMono: () => import('@remotion/google-fonts/UbuntuMono'),
};

/**
 * Get list of font IDs that can be loaded
 */
export function getLoadableFontIds(): string[] {
  return Object.keys(FONT_LOADERS);
}

/**
 * Check if a font can be loaded
 */
export function canLoadFont(fontId: string): boolean {
  return fontId in FONT_LOADERS;
}

/**
 * Dynamically load a Cyrillic font by ID
 * Returns the CSS font-family string
 */
export async function loadCyrillicFont(fontId: string): Promise<string> {
  // Check cache first
  if (fontCache.has(fontId)) {
    return fontCache.get(fontId)!;
  }

  // Get the loader for this font
  const loader = FONT_LOADERS[fontId];

  if (!loader) {
    console.warn(`Font ${fontId} not found in loader map, using ${DEFAULT_FONT_ID}`);
    return loadCyrillicFont(DEFAULT_FONT_ID);
  }

  try {
    const fontModule = await loader();

    // Load the font with specific weights and subsets to avoid timeout
    if (fontModule.loadFont) {
      fontModule.loadFont('normal', {
        weights: ['400', '700', '900'],
        subsets: ['cyrillic', 'latin'],
      });
    }

    // Get the font family string
    const fontFamily = fontModule.fontFamily || fontId;

    // Cache it
    fontCache.set(fontId, fontFamily);

    return fontFamily;
  } catch (error) {
    console.warn(`Failed to load font ${fontId}:`, error);
    // Return fallback
    return 'Montserrat, sans-serif';
  }
}
