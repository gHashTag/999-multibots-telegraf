/**
 * Module aliases setup for tests
 * 
 * This sets up module aliases that mimic the TypeScript path mapping
 * to make imports like @/utils work in the tests.
 */

const path = require('path');
const moduleAlias = require('module-alias');

// Define root path
const rootPath = path.join(__dirname, '../../../..');  // Get to the root from this file

// Define our aliases
const aliases = {
  '@': path.join(rootPath, 'src'),
  '@/utils': path.join(rootPath, 'src/utils'),
  '@/helpers': path.join(rootPath, 'src/helpers'),
  '@/scenes': path.join(rootPath, 'src/scenes'),
  '@/services': path.join(rootPath, 'src/services'),
  '@/types': path.join(rootPath, 'src/types'),
  '@/test-utils': path.join(rootPath, 'src/test-utils'),
  '@/inngest': path.join(rootPath, 'src/inngest'),
  '@/middlewares': path.join(rootPath, 'src/middlewares'),
  '@/locales': path.join(rootPath, 'src/locales'),
  '@/actions': path.join(rootPath, 'src/actions'),
  '@/constants': path.join(rootPath, 'src/constants'),
};

// Add module aliases
moduleAlias.addAliases(aliases);

// Setup mocks for core modules to avoid real dependencies
// These modules will be mocked in tests to prevent real connections or operations
const mockModules = {
  '@/utils/logger': path.join(rootPath, 'src/test-utils/core/mock/loggerMock.js'),
  '@/helpers/language': path.join(rootPath, 'src/test-utils/core/mock/languageMock.js'),
  '@/supabase': path.join(rootPath, 'src/test-utils/core/mock/supabaseMock.js'),
};

// Register mock modules
Object.entries(mockModules).forEach(([moduleName, mockPath]) => {
  try {
    moduleAlias.addAlias(moduleName, mockPath);
    console.log(`[TEST SETUP] Mocked ${moduleName} with ${mockPath}`);
  } catch (error) {
    console.warn(`[TEST SETUP] Failed to mock ${moduleName}:`, error.message);
  }
});

console.log('[TEST SETUP] Module aliases configured for testing');

// Export the configuration for reference
module.exports = {
  aliasMap: {
    ...aliases,
    ...mockModules
  },
  rootPath
}; 