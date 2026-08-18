// Reset VIBEE Editor localStorage
// Run this in browser console to reset all editor state

(function resetEditorStorage() {
  console.log('🔄 Resetting VIBEE Editor storage...');

  // Storage keys that will be reset
  const STORAGE_KEYS = {
    assets: '@vibee/assets-v1',
    templates: '@vibee/templates-v1',
    selectedTemplate: '@vibee/selected-template-v1',
    templateSettings: '@vibee/template-settings-v1',
    tracks: '@vibee/tracks-v1',
    renderSession: '@vibee/render-session-v1',
  };

  // Remove all keys
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
    console.log(`✅ Removed: ${key}`);
  });

  console.log('🎉 Storage reset complete! Refresh the page.');
  console.log('💡 Default assets and templates will be loaded on refresh.');
})();
