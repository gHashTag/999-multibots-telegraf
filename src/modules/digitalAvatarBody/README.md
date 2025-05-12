# DigitalAvatarBody Module

## Overview
The `DigitalAvatarBody` module is designed to handle the creation and training of digital avatar models. It integrates with external services like Replicate for model training and Supabase for data management. The module follows a dependency injection (DI) approach to ensure isolation and testability.

## Features
- **Model Training**: Initiates and manages the training of digital avatar models using Replicate API.
- **User Balance Management**: Integrates with Supabase to check and update user balances for training operations.
- **File Handling**: Manages file uploads for training data.

## Dependencies
- **Replicate**: For model training operations.
- **Supabase**: For user data and balance management.
- **Logger**: For logging operations and errors.
- **Inngest**: For handling background tasks and events.
- **File System**: For file operations like reading and copying.
- **Axios**: For making HTTP requests.

## Usage
This module is initialized with a set of dependencies defined in `DigitalAvatarBodyDependencies` interface. It provides services like `modelTrainingService` for initiating model training requests.

## Testing
Unit tests are located in the `__tests__` directory and cover various scenarios including cost configuration errors and file upload issues. 