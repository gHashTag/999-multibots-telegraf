// Centralized configuration for API endpoints
// Single source of truth for all service URLs
import { SERVICE_ENDPOINTS } from '@vibee/atoms';

// API Base URL (MCP server)
export const API_BASE = import.meta.env.VITE_API_URL || SERVICE_ENDPOINTS.mcp;

// Render Server URL (Remotion)
export const RENDER_URL = import.meta.env.VITE_RENDER_URL || SERVICE_ENDPOINTS.remotion;

// WebSocket URL (derived from MCP server)
export const WS_BASE = import.meta.env.VITE_WS_URL || SERVICE_ENDPOINTS.mcp.replace('https://', 'wss://');

// Telegram Bridge URL
export const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || SERVICE_ENDPOINTS.bridge;

// Helper to get WebSocket URL for specific path
export function getWsUrl(path: string): string {
  return `${WS_BASE}${path}`;
}

// Helper to get API URL for specific path
export function getApiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

// Helper to get Render URL for specific path
export function getRenderUrl(path: string): string {
  return `${RENDER_URL}${path}`;
}
