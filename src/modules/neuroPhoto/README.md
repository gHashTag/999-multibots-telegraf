# NeuroPhoto Module

## Overview

The `neuroPhoto` module is responsible for generating photorealistic images using AI models. It provides services for two main versions of neurophoto generation:

-   **V1 (General Purpose):** Utilizes a user-specified Replicate model URL for image generation. Suitable for a wide range of general image generation tasks based on a prompt.
-   **V2 (Personalized Body LoRA - BFL):** Leverages a personalized AI model (Body Face LoRA - `bfl`) trained for the user, combined with a user prompt, to generate images with the user's likeness.

## Core Services

The module exposes the following primary service functions located in `src/modules/neuroPhoto/services/neuroPhotoService.ts`:

### 1. `generateNeuroPhotoV1(params: GenerateV1Params, dependencies: NeuroPhotoServiceDependencies): Promise<GenerationResultItem[]>`

   -   Generates images using a provided Replicate model URL (`params.userModelUrl`).
   -   Handles prompt processing, payment, Replicate API interaction, file saving, and result aggregation.
   -   See `GenerateV1Params` for input parameters.

### 2. `generateNeuroPhotoV2(params: GenerateV2Params, dependencies: NeuroPhotoServiceDependencies): Promise<GenerationResultItem[]>`

   -   Generates images using the user's trained Body Face LoRA (`bfl`) model.
   -   Retrieves the user-specific `bfl` model and trigger word.
   -   Constructs a detailed prompt incorporating the user's prompt, trigger word, and gender information.
   -   Manages payment, Replicate API calls, file handling, and returns generation results.
   -   See `GenerateV2Params` for input parameters.

## Dependencies (`NeuroPhotoServiceDependencies`)

Both service functions rely on a `NeuroPhotoServiceDependencies` object passed to them, which abstracts away external interactions and makes the core logic testable. Key dependencies include:

-   `replicateRun`: Interface to the Replicate API.
-   `getUserByTelegramIdString`: Fetches user data from the database.
-   `updateUserLevelPlusOne`: Updates user level (if applicable).
-   `savePromptDirect`: Saves generation details (prompt, URLs, etc.) to the database.
-   `getLatestUserModel`: Fetches the user's latest trained model (e.g., 'bfl' for V2).
-   `getUserData`: Fetches additional user data (e.g., gender for V2).
-   `directPaymentProcessor`: Handles payment processing.
-   `calculateModeCost`: Calculates the cost of generation.
-   `saveFileLocally`: Saves generated images to the local filesystem.
-   `sendMediaToPulse`: Sends generated media to a monitoring/logging service (Pulse).
-   `processApiResponse`: Parses the output from Replicate.
-   `generateUUID`: Generates unique identifiers.
-   `getAspectRatio`: Fetches user's preferred aspect ratio (used in V1).
-   `logInfo`, `logError`, `logWarn`: Logging functions.

(Refer to `src/modules/neuroPhoto/interfaces/neuroPhotoDependencies.interface.ts` for the full interface definition.)

## Testing

Unit tests for these services are located in `src/modules/neuroPhoto/__tests__/`:

-   `neuroPhotoServiceV1.test.ts`: Contains tests for `generateNeuroPhotoV1`.
-   `neuroPhotoServiceV2.test.ts`: Contains tests for `generateNeuroPhotoV2`.

All external dependencies are mocked to ensure isolated and reliable testing of the module's logic. 