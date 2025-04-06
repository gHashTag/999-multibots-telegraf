export async function getTelegramIdFromFinetune(finetuneId: string) {
  const url = `https://api.us1.bfl.ai/v1/finetune_details?finetune_id=${finetuneId}`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Key': process.env.BFL_API_KEY || '',
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Ошибка HTTP: ${response.status}`)
    }

    const data = await response.json()
    console.log('getTelegramIdFromFinetune data:', data)
    const telegramId = data.finetune_details.finetune_comment

    console.log('Telegram ID:', telegramId)
    return telegramId
  } catch (error) {
    console.error('Ошибка при получении Telegram ID:', error)
    return null
  }
}
