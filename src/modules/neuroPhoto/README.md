# NeuroPhoto Module

## Overview

The `NeuroPhoto` module is designed to handle the generation of neural network-based photos or images based on user prompts. This module follows the modularity principles established in the `videoGenerator` module to ensure independence, testability, and maintainability.

## Purpose

- **Primary Function**: Generate images using neural network models (e.g., via Replicate API) based on user input prompts.
- **Scope**: Handles user input validation, balance checking, image generation, saving results, and user feedback via Telegram.

## Structure

- **`index.ts`**: Main entry point exporting the core function `generateNeuroPhoto`.
- **`config/`**: Configuration files for models and pricing.
- **`helpers/`**: Utility functions for specific tasks like user data retrieval or balance processing.
- **`adapters/`**: Integration logic for external APIs (e.g., Replicate).
- **`interfaces/`**: Type definitions for inputs, outputs, and dependencies.
- **`services/`**: Core logic for image generation and processing.
- **`stages/`**: Workflow or wizard stages for user interaction (if applicable).
- **`__tests__/`**: Test suite covering success, error, and edge cases.

## Dependencies

- Dependencies are injected via a `NeuroPhotoDependencies` interface to avoid direct imports of external services.
- External interactions (e.g., Supabase for user data, Replicate for image generation) are abstracted through helpers.

## Usage

```typescript
import { generateNeuroPhoto } from './index';

await generateNeuroPhoto(prompt, modelUrl, numImages, telegramId, ctx, botName, dependencies);
```

## Testing

- Tests are located in `__tests__/` and structured by feature or scenario.
- Mocking is used to simulate external API behavior and user data.

## Development

- Development occurs in a feature branch (e.g., `feature/neurophoto-module-stabilization`).
- Merge to `main` only after full stabilization and 100% test coverage. 