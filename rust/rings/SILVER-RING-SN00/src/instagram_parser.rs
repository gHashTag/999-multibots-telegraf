use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, return_to_menu};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_instagram_parser_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let chat_id = msg.chat.id;

    let profile_url = match msg.text() {
        Some(t) => t.to_string(),
        None => {
            bot.send_message(chat_id, if lang.is_russian() { "Отправьте ссылку на Instagram профиль" } else { "Send an Instagram profile link" }).await?;
            return Ok(());
        }
    };
    if !profile_url.contains("instagram.com") {
        bot.send_message(chat_id, if lang.is_russian() { "❌ Неверная ссылка. Отправьте ссылку на Instagram." } else { "❌ Invalid link. Send an Instagram link." }).await?;
        return Ok(());
    }

    let text = if lang.is_russian() {
        format!("📊 Анализ профиля...\n\n{}\n\nФункция в разработке. Скоро будет доступна!", profile_url)
    } else {
        format!("📊 Analyzing profile...\n\n{}\n\nThis feature is under development. Coming soon!", profile_url)
    };
    bot.send_message(chat_id, text).await?;
    return_to_menu(&bot, &dialogue, chat_id, lang).await
}
