// ===============================
// @vibee/atoms - Assets Atom
// Single source of truth for Web & Mobile editors
// ===============================

import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { Asset } from '../types';
import { STORAGE_KEYS } from '../keys';
import { DEFAULT_ASSETS, DEFAULT_ASSET_IDS } from '../defaults';

// ===============================
// Core Assets Atom
// ===============================

export const assetsAtom = atomWithStorage<Asset[]>(
  STORAGE_KEYS.assets,
  DEFAULT_ASSETS
);

// ===============================
// Asset Actions
// ===============================

let assetCounter = 0;

export const addAssetAtom = atom(
  null,
  (get, set, assetData: Omit<Asset, 'id'>) => {
    const id = `asset-${Date.now()}-${++assetCounter}`;
    const assets = get(assetsAtom);
    set(assetsAtom, [...assets, { ...assetData, id }]);
    return id;
  }
);

export const removeAssetAtom = atom(
  null,
  (get, set, assetId: string) => {
    // Don't remove default assets
    if (DEFAULT_ASSET_IDS.includes(assetId)) return;
    set(assetsAtom, get(assetsAtom).filter((a) => a.id !== assetId));
  }
);

export const updateAssetAtom = atom(
  null,
  (get, set, { assetId, updates }: { assetId: string; updates: Partial<Asset> }) => {
    set(assetsAtom, get(assetsAtom).map((a) =>
      a.id === assetId ? { ...a, ...updates } : a
    ));
  }
);

export const resetAssetsAtom = atom(
  null,
  (_get, set) => {
    set(assetsAtom, DEFAULT_ASSETS);
  }
);

// ===============================
// Asset Selectors
// ===============================

export const getAssetByIdAtom = atom((get) => {
  const assets = get(assetsAtom);
  return (assetId: string) => assets.find((a) => a.id === assetId);
});

export const getAssetsByTypeAtom = atom((get) => {
  const assets = get(assetsAtom);
  return (type: Asset['type']) => assets.filter((a) => a.type === type);
});

// ===============================
// Batch Selection Mode
// ===============================

export const assetSelectionModeAtom = atom(false);
export const selectedAssetIdsAtom = atom<string[]>([]);

export const toggleAssetSelectionModeAtom = atom(
  null,
  (get, set) => {
    const current = get(assetSelectionModeAtom);
    set(assetSelectionModeAtom, !current);
    if (current) {
      set(selectedAssetIdsAtom, []);
    }
  }
);

export const toggleAssetSelectionAtom = atom(
  null,
  (get, set, assetId: string) => {
    const current = get(selectedAssetIdsAtom);
    if (current.includes(assetId)) {
      set(selectedAssetIdsAtom, current.filter((id) => id !== assetId));
    } else {
      set(selectedAssetIdsAtom, [...current, assetId]);
    }
  }
);

export const clearAssetSelectionAtom = atom(
  null,
  (_get, set) => {
    set(selectedAssetIdsAtom, []);
    set(assetSelectionModeAtom, false);
  }
);

export const selectAllAssetsAtom = atom(
  null,
  (get, set) => {
    const assets = get(assetsAtom);
    set(selectedAssetIdsAtom, assets.map((a) => a.id));
  }
);

export const deleteSelectedAssetsAtom = atom(
  null,
  (get, set) => {
    const selectedIds = get(selectedAssetIdsAtom);
    const assets = get(assetsAtom);
    // Filter out selected, but keep default assets
    set(assetsAtom, assets.filter((a) =>
      !selectedIds.includes(a.id) || DEFAULT_ASSET_IDS.includes(a.id)
    ));
    set(selectedAssetIdsAtom, []);
    set(assetSelectionModeAtom, false);
  }
);

// Re-export defaults
export { DEFAULT_ASSETS, DEFAULT_ASSET_IDS };
