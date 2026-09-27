/**
 * The Queen-delegatable spec gate now lives in @vibee/atoms so the app's coding
 * composer and this render CLI read ONE copy (the engine's rule, mirrored). This
 * file stays as the render-side import path `tri spec` and its test already use;
 * it re-exports the shared rule rather than holding a second copy.
 *
 * Authority remains the compiled engine (gHashTag/BrowserOS QueenSpecQuality).
 */
export {
  judge,
  scaffold,
  shortfall,
  boundaryPaths,
  pathToken,
  CRITERIA_HEADINGS,
  type SpecCheck,
  type SpecCheck as Check,
  type SpecVerdict,
  type SpecVerdict as Verdict,
} from '@vibee/atoms'
