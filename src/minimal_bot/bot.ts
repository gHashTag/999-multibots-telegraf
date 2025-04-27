import { Telegraf } from 'telegraf'
import type { MyContext } from '@/interfaces/context.interface'
import { handleTestButtonCommand, testButtonCommand } from './button_handler'

// Basic setup - assumes BOT_TOKEN is available in environment
// In a real app, use proper config loading
const token = process.env.BOT_TOKEN
if (!token) {
  throw new Error('BOT_TOKEN is required')
}

const bot = new Telegraf<MyContext>(token)

// Register the command handler
bot.command(testButtonCommand, handleTestButtonCommand)

// Basic error handler
bot.catch((err, ctx) => {
  console.error(`Ooops, encountered an error for ${ctx.updateType}`, err)
})

// Export the bot instance if needed for other purposes (e.g., manual launch)
// export default bot;

// Example of launching (not needed for testing handler directly)
// bot.launch().then(() => {
//   console.log('Minimal bot started');
// });

// process.once('SIGINT', () => bot.stop('SIGINT'));
// process.once('SIGTERM', () => bot.stop('SIGTERM'));
