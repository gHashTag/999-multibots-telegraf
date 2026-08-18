/**
 * Factory Parts - Composable Template Components
 *
 * Export all variation axis components and configurations.
 */

// Avatar Layouts
export {
  AvatarLayoutAdapter,
  AVATAR_LAYOUTS,
  supportsMorphing,
  getDefaultSize,
  isSplitLayout,
  getContentArea,
} from './AvatarLayouts';

// Hook Styles
export {
  HookRenderer,
  HOOK_STYLES,
} from './HookStyles';

// Caption Styles
export {
  CAPTION_STYLES,
  mapToSubtitlesProps,
  generateCaptionsFromText,
  calculateCaptionTiming,
  getSafeCaptionPosition,
  isCaptionStyleCompatible,
  getRecommendedCaptionStyle,
  createDefaultCaptionConfig,
} from './CaptionStyles';

// B-Roll Patterns
export {
  generateBRollSegments,
  BROLL_PATTERNS,
  DEFAULT_ANIMATIONS,
  createBRollConfig,
  calculateBRollTime,
  getActiveSegment,
  isInTransition,
} from './BRollPatterns';

// Avatar Morph (premium morphing with Avatar2)
export { AvatarMorph, type AvatarMorphProps } from './AvatarMorph';
