// ===============================
// Uploads Atoms - Global upload progress
// ===============================

import { atom } from 'jotai';
import { produce } from 'immer';

export interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

// State
export const uploadsAtom = atom<UploadProgress[]>([]);

// Add upload
export const addUploadAtom = atom(
  null,
  (get, set, upload: UploadProgress) => {
    set(uploadsAtom, produce(get(uploadsAtom), (draft) => {
      draft.push(upload);
    }));
  }
);

// Update upload
export const updateUploadAtom = atom(
  null,
  (get, set, { fileName, updates }: { fileName: string; updates: Partial<UploadProgress> }) => {
    set(uploadsAtom, produce(get(uploadsAtom), (draft) => {
      const upload = draft.find((u) => u.fileName === fileName);
      if (upload) {
        Object.assign(upload, updates);
      }
    }));
  }
);

// Remove upload
export const removeUploadAtom = atom(
  null,
  (get, set, fileName: string) => {
    set(uploadsAtom, get(uploadsAtom).filter((u) => u.fileName !== fileName));
  }
);

// Clear all uploads
export const clearUploadsAtom = atom(
  null,
  (get, set) => {
    set(uploadsAtom, []);
  }
);
