use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, load_lang_cb, return_to_menu};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_cancel_predictions_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let text = if lang.is_russian() {
        "❌ Все активные генерации отменены."
    } else {
        "❌ All active generations cancelled."
    };
    bot.send_message(msg.chat.id, text).await?;
    return_to_menu(&bot, &dialogue, msg.chat.id, lang).await
}

pub async fn handle_cancel_predictions_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let chat_id = q.chat_id().unwrap();
    let text = if lang.is_russian() { "❌ Генерации отменены." } else { "❌ Generations cancelled." };
    bot.send_message(chat_id, text).await?;
    return_to_menu(&bot, &dialogue, chat_id, lang).await
}
