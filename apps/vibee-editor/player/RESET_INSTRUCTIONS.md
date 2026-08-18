# VIBEE Editor - Reset Instructions

## Problem: Incorrect Asset/Template Paths

If you see incorrect assets or broken template thumbnails, your localStorage may have stale data with old paths.

## Solution 1: Quick Reset (Browser Console)

1. Open http://localhost:5178/editor
2. Press F12 to open DevTools
3. Go to Console tab
4. Copy and paste this code:

```javascript
(function resetEditorStorage() {
  console.log('🔄 Resetting VIBEE Editor storage...');
  const keys = [
    '@vibee/assets-v1',
    '@vibee/templates-v1',
    '@vibee/selected-template-v1',
    '@vibee/template-settings-v1',
    '@vibee/tracks-v1',
    '@vibee/render-session-v1',
  ];
  keys.forEach(key => {
    localStorage.removeItem(key);
    console.log(`✅ Removed: ${key}`);
  });
  console.log('🎉 Storage reset complete! Refresh the page.');
})();
```

5. Press Enter
6. Refresh the page

## Solution 2: Automatic Reset Script

1. Open http://localhost:5178/reset-storage.js
2. Run the script from the console

## What This Fixes

- **Assets**: Resets to DEFAULT_ASSETS with correct `/backgrounds/business/` paths
- **Templates**: Resets to default "Vibee Reel 1" template
- **Tracks**: Clears any broken timeline data
- **Template Settings**: Clears saved per-template settings

## After Reset

You should see:
- ✅ Correct background thumbnails in the Templates panel
- ✅ Backgrounds in /backgrounds/business/ directory (00.mp4, 01.mp4, 02.mp4, 03.mp4, 04.mp4)
- ✅ Default lipsync video: /lipsync/lipsync.mp4
- ✅ Default cover: /covers/cover.jpeg

## Default Asset Paths

```
Lipsync Video:     /lipsync/lipsync.mp4
Cover Image:       /covers/cover.jpeg
Background 00:     /backgrounds/business/00.mp4
Background 01:     /backgrounds/business/01.mp4
Background 02:     /backgrounds/business/02.mp4
Background 03:     /backgrounds/business/03.mp4
Background 04:     /backgrounds/business/04.mp4
```

## Troubleshooting

If reset doesn't work:

1. Clear all cookies and site data for localhost:5178
2. Use incognito/private mode
3. Check DevTools → Application → Local Storage
4. Manually delete all keys starting with `@vibee/`
