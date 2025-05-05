# TextToImageWizard Scene

## Overview

This scene guides the user through the process of generating an image from text input using the `textToImage` module. It is part of the Telegram bot's interactive flow.

## Structure

- **interfaces/**: Type definitions for the scene's data and dependencies.
- **helpers/**: Utility functions used within the scene.
- **__tests__/**: Unit tests for the scene's functionality.

## Usage

This scene is triggered when a user initiates the text-to-image generation process in the Telegram bot. It prompts the user for text input and generates an image based on the provided text.

## Testing

Run tests with:

```bash
pnpm vitest run src/scenes/textToImageWizard/__tests__
``` 