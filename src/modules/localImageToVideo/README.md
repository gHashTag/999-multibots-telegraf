# Local Image to Video Generation Module

This module generates videos from images using the Replicate API.

## Workflow

The `generateImageToVideo` function orchestrates the video generation process:

1.  **Input**: Receives an `ImageToVideoRequest` object containing:
    *   `imageUrl`: The URL of the image to use as input.
    *   `prompt`: The prompt to guide the video generation.
    *   `videoModel`: The identifier of the video model to use (key from `VIDEO_MODELS_CONFIG`).
    *   `metadata`: Metadata like user ID and bot ID.
    *   `locale`: Localization settings.
2.  **Model Selection**: Uses the `videoModel` to retrieve the corresponding model configuration from `VIDEO_MODELS_CONFIG.ts`. This config contains the Replicate model ID and input parameters.
3.  **Image Download**: Downloads the image from `imageUrl` using the `downloadFile` function.
4.  **Replicate API Call**: Calls the Replicate API using the specified model ID and a constructed input object. The input object includes the prompt and the image data passed as a Base64-encoded Data URI.
    *   The API is called with the model ID obtained from `VIDEO_MODELS_CONFIG.ts`, model is passed to Replicate with the `input` parameter which follows this stucture:
        *   `prompt` : The text prompt (if the model supports it).
        *   `image` : The Base64-encoded image.
        *   Any other parameters required by the model (read from `VIDEO_MODELS_CONFIG.ts`).
5.  **Output Processing**: Extracts the generated video URL from the Replicate API response. The response from replicate should be string, or a string within array
6.  **Result**: Returns an `ImageToVideoResponse` object containing the video URL and a success message.

## Implementation Details

-   The `downloadFile` function uses `axios` to download images from URLs. It converts the downloaded image to a Buffer, then to a Base64-encoded Data URI, which is passed to the Replicate API.
-   The configuration for available models can be found in `VIDEO_MODELS_CONFIG.ts`
-   Error handling is implemented at each step (download, Replicate API call).

## Dependencies

-   `replicate` (Replicate API client)
-   `axios` (for image downloading)
-   `VIDEO_MODELS_CONFIG.ts` (for model configurations)
-   `downloadFile.ts` (helper for downloading files)
-   All the necessary dependencies are exported from `./types.ts`

## Testing
To run tests, execute:

```shell
bun test src/modules/localImageToVideo/__tests__/generateImageToVideo.test.ts
```

## Debugging

If the video generation fails, check the following:

-   Make sure the `REPLICATE_API_TOKEN` environment variable is set.
-   Make sure the Replicate API model ID in `VIDEO_MODELS_CONFIG.ts` is correct.
-   Check the Replicate API status.
-   Verify that the input parameters (`prompt`, `imageUrl`, `aspectRatio`) are valid for the selected model.
-   Examine the logs (especially the logger for accurate error messages) for more information.

## Additional considerations
- The `imageKey` from VIDEO_MODELS_CONFIG specifies what is the name of the image input on Replicate API
- For now the system only creates a still-image, and will require code changes to perform proper video creations.

**NOTE**: This README describes the Replicate API-based implementation of image-to-video generation.
