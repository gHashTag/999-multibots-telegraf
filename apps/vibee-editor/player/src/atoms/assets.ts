// ===============================
// Assets Atom - Re-exports from @vibee/atoms
// ===============================

// Re-export everything from @vibee/atoms
export {
  // Core atom
  assetsAtom,
  // Actions
  addAssetAtom,
  removeAssetAtom,
  updateAssetAtom,
  resetAssetsAtom,
  // Selectors
  getAssetByIdAtom,
  getAssetsByTypeAtom,
  // Batch selection
  assetSelectionModeAtom,
  selectedAssetIdsAtom,
  toggleAssetSelectionModeAtom as toggleSelectionModeAtom,
  toggleAssetSelectionAtom,
  clearAssetSelectionAtom,
  selectAllAssetsAtom,
  deleteSelectedAssetsAtom,
  // Defaults
  DEFAULT_ASSETS,
  DEFAULT_ASSET_IDS,
} from '@vibee/atoms';

// Re-export types
export type { Asset, AssetType } from '@vibee/atoms';
