import { openai, model } from '.'

export async function getSlides({
  prompt,
  scenesCount = 3,
  isDescription = false,
}: {
  prompt: string
  scenesCount?: number
  isDescription?: boolean
}) {
  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: isDescription
            ? `DON'T USE EMOJI In onScreenTitle. don't use markdown syntax(DON'T USE * AND #). You need to use smiles(emoji) in videoDescription. You are a professional marketer who creates attractive and selling scenarios for Instagram videos.You need to write some interesting text for videos that will get a lot of views. For example, some life hacks for school, tips, motivation, and so on. This text will be posted in the comments to the video. Return it in json format. in videoDescription, you need to write useful information, and not describe what is happening in the video. The videoDescription cannot be longer than 4096 characters. Form the text beautifully, make indents. Example: {
              "reels": {
              "onScreenTitle": "onScreenTitle", //don't use emoji
              "videoDescription": "videoDescription" //use emoji
              }
            }`
            : `DONT'T USE EMOJI. You are a professional marketer who creates attractive and selling video scripts for Instagram videos.You need to write a short text, maybe with some kind of plot for ${scenesCount} scenes. No need to mention any discounts or promotions. Create an array of scenes in json format. Example: {
            "scenes": [
              {
                "number": 1,
                "text": "text",
                "onscreenText": "onscreenText",
              },
              {
                "number": 2,
                "text": "text",
                "onscreenText": "onscreenText",
              },
              {
                "number": 3,
                "text": "text",
                "onscreenText": "onscreenText"
              }
            ]
          }`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })
    console.log(completion, 'completion')

    const content = completion.choices[0].message.content
    if (content === null) {
      throw new Error('Received null content from OpenAI')
    }

    console.log(content)
    return JSON.parse(content)
  } catch (error) {
    console.error('Error:', error)
    throw error // Перебрасываем ошибку, чтобы она могла быть обработана выше
  }
}
