// ===============================
// Jotai Provider
// ===============================

import { Provider, createStore } from 'jotai';
import { Suspense, type ReactNode } from 'react';

// Create a global store for the editor
const editorStore = createStore();

interface JotaiProviderProps {
  children: ReactNode;
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-white text-lg">Loading...</div>
    </div>
  );
}

export function JotaiProvider({ children }: JotaiProviderProps) {
  return (
    <Provider store={editorStore}>
      <Suspense fallback={<LoadingFallback />}>
        {children}
      </Suspense>
    </Provider>
  );
}

// Export store for external access (e.g., in WebSocket handlers)
export { editorStore };
