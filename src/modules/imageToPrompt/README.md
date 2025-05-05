# ImageToPrompt Module

## Overview

The `ImageToPrompt` module is designed to generate textual prompts from images within the Telegraf bot ecosystem. It follows a modular architecture to ensure independence from external dependencies, allowing for easy testing and maintenance.

## Features

- **Prompt Generation**: Analyzes an image URL to generate a descriptive textual prompt using an external API.
- **User Interaction**: Notifies users about the start and completion of image analysis, as well as any errors that occur.
- **Balance Management**: Checks and updates user balance for image analysis operations.
- **Data Persistence**: Saves generated prompts to a database for future reference.

## Architecture

The module adheres to the principles of modularity and dependency injection:

- **index.ts**: Entry point exporting the main function `generatePromptFromImage`.
- **interfaces/**: Defines `ImageToPromptDependencies` for dependency injection.
- **services/**: Contains the core logic in `generatePromptFromImageService.ts`.
- **adapters/**: Includes `telegramSceneAdapter.ts` for Telegram interactions and `imageAnalysisApi.ts` for external API calls.
- **helpers/**: Utility functions for user data, balance operations, and data saving.
- **__tests__/**: Comprehensive test suite for the module's functionality.

## Usage

```typescript
import { generatePromptFromImage } from './index'
import { ImageToPromptDependencies } from './interfaces'

// Define dependencies
const dependencies: ImageToPromptDependencies = {
  // ... define dependencies here
}

// Call the function
await generatePromptFromImage(imageUrl, telegramId, ctx, botName, dependencies)
```

## Testing

Tests are located in the `__tests__` directory. They cover successful prompt generation and various error scenarios. To run tests:

```bash
pnpm vitest run --coverage src/modules/imageToPrompt/__tests__/*.test.ts
```

## Dependencies

This module is designed to be independent, with all external interactions abstracted through interfaces and injected as dependencies. 