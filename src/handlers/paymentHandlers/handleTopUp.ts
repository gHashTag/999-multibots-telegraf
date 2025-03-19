import { handleBuy } from '@/handlers'

export async function handleTopUp(ctx) {
  try {
    console.log('CASE: handleTopUp')
    const data = ctx.match[0]
    console.log('data', data)
    const isRu = ctx.from?.language_code === 'ru'
    await handleBuy({ ctx, data, isRu })
  } catch (error) {
    console.error('Error handling top-up:', error)
  }
}
