# DigitalAvatarBody Module

## Overview

This module is responsible for creating and managing digital avatar bodies. It integrates with various APIs and services to generate and customize avatar bodies based on user input.

## Structure

- **config/**: Configuration files for different environments and API keys.
- **helpers/**: Utility functions used within the module.
- **adapters/**: Integration with external services and APIs.
- **__tests__/**: Unit tests for the module's functionality.

## Usage

```typescript
import { createDigitalAvatarBody } from './index';

await createDigitalAvatarBody('user123', 'testUser', true, 'botName', { /* input data */ });
```

## Testing

Run tests with:

```bash
pnpm vitest run src/modules/digitalAvatarBody/__tests__
``` 