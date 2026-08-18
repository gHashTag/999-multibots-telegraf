import type { LipSyncMainProps } from '@/store/editorStore';
import { DEFAULT_COMPOSITION_ID } from '@/shared/compositions';

const API_BASE = '/api';

export interface HealthResponse {
  status: string;
  compositions: string[];
}

export interface RenderRequest {
  compositionId: string;
  inputProps: LipSyncMainProps;
}

export interface RenderResponse {
  success: boolean;
  outputPath?: string;
  error?: string;
}

export async function checkHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.statusText}`);
  }
  return response.json();
}

export async function renderVideo(
  props: LipSyncMainProps,
  onProgress?: (progress: number) => void
): Promise<RenderResponse> {
  const request: RenderRequest = {
    compositionId: DEFAULT_COMPOSITION_ID,
    inputProps: props,
  };

  const response = await fetch(`${API_BASE}/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Render failed: ${error}`);
  }

  // Simulate progress for now (render-server doesn't have SSE yet)
  if (onProgress) {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
      }
      onProgress(progress);
    }, 500);
  }

  return response.json();
}

export function getDownloadUrl(outputPath: string): string {
  // outputPath is like "out/render-xxx.mp4"
  return `${API_BASE}/${outputPath}`;
}
