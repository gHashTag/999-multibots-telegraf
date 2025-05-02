import axios from 'axios'

export type DownloadFunction = (url: string) => Promise<Buffer>

/**
 * Downloads a file from a URL and returns its content as a Buffer.
 * @param url - The URL of the file to download.
 * @returns A Promise resolving to the file content as a Buffer.
 * @throws Throws an error if the download fails or the response is not successful.
 */
export const downloadFile: DownloadFunction = async (
  url: string
): Promise<Buffer> => {
  try {
    console.info(`Downloading file from: ${url}`) // Use console for simplicity, or inject logger if needed later
    const response = await axios.get(url, {
      responseType: 'arraybuffer', // Important to get binary data correctly
      validateStatus: status => status >= 200 && status < 300, // Only treat 2xx as success
    })

    if (!response.data) {
      throw new Error('No data received from URL')
    }

    console.info(`Downloaded successfully ${response.data.length} bytes.`)
    return Buffer.from(response.data) // Convert ArrayBuffer/string to Buffer if necessary
  } catch (error: any) {
    let errorMessage = `Failed to download file from ${url}.`
    if (axios.isAxiosError(error)) {
      errorMessage += ` Status: ${error.response?.status}. Message: ${error.message}`
      // console.error('Axios error details:', error.toJSON()); // More details if needed
    } else {
      errorMessage += ` Error: ${error.message}`
    }
    console.error(errorMessage)
    throw new Error(errorMessage) // Re-throw a generic error
  }
}
