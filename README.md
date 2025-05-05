# Telegram Bot Video Generation System

## Overview
This project is focused on developing a modular and scalable Telegram bot system for video generation. The primary goal is to refactor the `imageToVideo` functionality to ensure modularity, independence, and portability across different projects.

## Refactoring Goals
1. **Modularity**: Break down the system into independent modules that can be reused in different contexts without hard-coded dependencies.
2. **Dependency Injection**: Pass dependencies as parameters to functions to improve testability and flexibility.
3. **Background Task Execution**: Implement video generation as a background task to improve user experience by not blocking the main interaction flow.
4. **Documentation**: Maintain detailed documentation of the system architecture, refactoring steps, and successful patterns for future development.

## Key Changes
- **imageToVideoWizard**: Refactored to initiate video generation as a background task, allowing the scene to exit immediately after starting the process.
- **generateImageToVideo**: Modified to accept `telegramInstance` and `chatId` for direct communication, removing direct imports and ensuring dependencies are passed explicitly.
- **Testing**: Updated test suites to mock dependencies properly and ensure the system works without real API calls.

## Future Plans
- Apply the modular pattern established with `imageToVideo` to other scenes in the bot.
- Enhance error handling, logging, and user experience features like previews before generation.
- Continue documenting successful patterns and system history for easier onboarding and maintenance.

## Running the Project
- **Type Checking**: Use `pnpm tsc --noEmit` to check for type errors.
- **Testing**: Run `pnpm vitest run` to execute the test suite.
- **Environment**: Ensure a `.env.test` file is set up with necessary mock values for testing.

For more details on specific patterns used for modularity, refer to [PATTERNS.md](PATTERNS.md).
