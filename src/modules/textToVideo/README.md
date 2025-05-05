# TextToVideo Module

## Overview

This module is responsible for generating videos from text descriptions. It integrates with various APIs and services to convert textual input into video content.

## Structure

- **config/**: Configuration files for different environments and API keys.
- **helpers/**: Utility functions used within the module.
- **adapters/**: Integration with external services and APIs.
- **__tests__/**: Unit tests for the module's functionality.

## Usage

```typescript
import { generateTextToVideo } from './index';

await generateTextToVideo('A beautiful sunset', 'user123', 'testUser', true, 'botName');
```

## Testing

Run tests with:

```bash
pnpm vitest run src/modules/textToVideo/__tests__
``` 