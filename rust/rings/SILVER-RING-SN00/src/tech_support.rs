use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, return_to_menu};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_tech_support_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let chat_id = msg.chat.id;

    let user_message = match msg.text() {
        Some(t) => t.to_string(),
        None => {
            bot.send_message(chat_id, if lang.is_russian() { "Опишите вашу проблему" } else { "Describe your issue" }).await?;
            return Ok(());
        }
    };
    let telegram_id = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
    if telegram_id == 0 {
        tracing::warn!("Missing telegram_id; aborting handler");
        return Ok(());
    }

    tracing::info!(telegram_id = telegram_id, message = %user_message, "Tech support request received");

    let text = if lang.is_russian() {
        "✅ Ваше обращение отправлено в техподдержку.\n\nМы ответим в ближайшее время.\n\nКонтакты:\n• @support_bot\n• support@example.com"
    } else {
        "✅ Your request has been sent to tech support.\n\nWe'll respond as soon as possible.\n\nContacts:\n• @support_bot\n• support@example.com"
    };
    bot.send_message(chat_id, text).await?;
    return_to_menu(&bot, &dialogue, chat_id, lang).await
}
