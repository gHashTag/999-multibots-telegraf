import { fetchWithAxios } from '@/core/axios/fetchWithAxios'

export async function createVoiceSyncLabs({
  fileUrl,
  username,
}: {
  fileUrl: string
  username: string
}): Promise<string | null> {
  const url = 'https://api.synclabs.so/voices/create'
  const body = JSON.stringify({
    name: username,
    description: `Voice created from Telegram voice message`,
    inputSamples: [fileUrl],
    webhookUrl: `${process.env.SUPABASE_URL}/functions/v1/synclabs-video`,
  })

  try {
    const response = await fetchWithAxios(url, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.SYNC_LABS_API_KEY as string,
        'Content-Type': 'application/json',
      },
      data: body,
    })

    if (response.status === 200) {
      // Изменено с response.ok на response.status === 200
      const result = response.data as { id: string } // Изменено с await response.json() на response.data
      console.log(result, 'result')
      return result.id
    } else {
      console.error(`Error: ${response.status} ${response.statusText}`)
      return null
    }
  } catch (error) {
    console.error(error)
    return null
  }
}
