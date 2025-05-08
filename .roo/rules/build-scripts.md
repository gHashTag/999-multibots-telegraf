---
description: Билд скрипт 
globs: 
alwaysApply: false
---
# 🏗️ Build Scripts Guide

## Build Scripts
- [build-prod.js](mdc:scripts/build-prod.js) - Production build script

## Production Build
```bash
# Run production build
node scripts/build-prod.js

# With environment variables
NODE_ENV=production node scripts/build-prod.js
```

## Build Parameters
- `NODE_ENV`: Environment setting (development/production)
- `BUILD_PATH`: Custom build output path
- `SKIP_TESTS`: Skip test execution (true/false)
- `DEBUG`: Enable debug output (true/false)

## Build Process
1. Clean build directory
2. Compile TypeScript
3. Bundle assets
4. Generate source maps
5. Optimize for production

## Important Notes
- Always run tests before production build
- Check environment variables
- Verify TypeScript configuration
- Monitor build size and performance
