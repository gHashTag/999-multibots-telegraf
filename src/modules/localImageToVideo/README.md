# Local Image to Video Generation Module

This module provides a way to generate videos from images using the Replicate API. It includes:

- `generateImageToVideo.ts`: The main function that takes an image URL and a prompt, and returns a video URL.
- `types.ts`: TypeScript interfaces for request/response types and dependencies.
- `VIDEO_MODELS_CONFIG.ts`: A configuration file containing a list of available video models and their corresponding Replicate API model IDs.
- `downloadFile.ts`: A helper function for downloading files from URLs.
- `__tests__/generateImageToVideo.unit.test.ts`: Unit tests for the `generateImageToVideo` function.

## Dependencies

- `replicate`: Used to call the Replicate API.  Make sure the `REPLICATE_API_TOKEN` environment variable is set.
- `axios`: Used in `downloadFile.ts` to download images from URLs.
- Configuration in `VIDEO_MODELS_CONFIG.ts`: Specifies the models, their IDs, and their required input parameters.

## Usage

1.  Import `generateImageToVideo` and `ImageToVideoDependencies`.
2.  Create a `ImageToVideoRequest` object with `imageUrl`, `prompt`, and `videoModel`.
3.  Create an `ImageToVideoDependencies` object with:
    - A Replicate client (or rely on the global `replicate` client).
    - A logger.
    - The `VIDEO_MODELS_CONFIG` constant.
    - A `downloadFile` function.
4.  Call `generateImageToVideo(request, dependencies)`.
5.  The function returns an `ImageToVideoResponse` with either the `videoUrl` or an error.

## Adding or Modifying Models

To add or modify video models, edit the `src/modules/localImageToVideo/VIDEO_MODELS_CONFIG.ts` file.  Ensure that the model you specify supports image input and has a valid `imageKey`.
Also be aware that depending on what is in the VIDEO_MODELS_CONFIG you might have to also update the types found in `/src/modules/localImageToVideo/types.ts`.

## Testing
To run tests, execute:

```shell
bun test src/modules/localImageToVideo/__tests__/generateImageToVideo.unit.test.ts
```

## Debugging

If the video generation fails, check the following:

-   Make sure the `REPLICATE_API_TOKEN` environment variable is set.
-   Make sure the Replicate API model ID in `VIDEO_MODELS_CONFIG.ts` is correct.
-   Check the Replicate API status.
-   Verify that the input parameters (`prompt`, `imageUrl`, `aspectRatio`) are valid for the selected model.
-   Examine the logs (especially the `errorMessageAdmin`) for more information.

**NOTE**: This README describes the Replicate API-based implementation of image-to-video generation.

