use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, return_to_menu};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

#[tracing::instrument(skip_all)]
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

    if profile_url.len() > 4000 {
        let err = if lang.is_russian() { "❌ Текст слишком длинный. Максимум 4000 символов." } else { "❌ Text too long. Maximum 4000 characters." };
        bot.send_message(chat_id, err).await?;
        return Ok(());
    }

    if !profile_url.contains("instagram.com") {
        bot.send_message(chat_id, if lang.is_russian() { "❌ Неверная ссылка. Отправьте ссылку на Instagram." } else { "❌ Invalid link. Send an Instagram link." }).await?;
        return Ok(());
    }

    let telegram_id = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
    if telegram_id == 0 {
        tracing::warn!("Missing telegram_id; aborting handler");
        return Ok(());
    }

    let me = match bot.get_me().await {
        Ok(u) => u,
        Err(e) => {
            tracing::warn!("Failed to get bot info: {}", e);
            return Ok(());
        }
    };
    let bot_name = me.user.username.as_deref().unwrap_or("");
    if !trios_mb_tg::access::has_parsing_access(telegram_id, bot_name) {
        tracing::warn!(%telegram_id, %bot_name, "User lacks parsing access for instagram_parser");
        let err = if lang.is_russian() { "❌ Нет доступа." } else { "❌ Access denied." };
        bot.send_message(chat_id, err).await?;
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
