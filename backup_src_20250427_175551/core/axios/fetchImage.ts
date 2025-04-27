import axios from 'axios'

export async function fetchImage(url: string): Promise<Buffer> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    validateStatus: status => status === 200,
    timeout: 30000,
  })
  return Buffer.from(response.data)
}
