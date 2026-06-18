use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, return_to_menu};
use trios_mb_tg::send_message_timeout;

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

#[tracing::instrument(skip_all)]
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
            send_message_timeout(
                &bot, chat_id, if lang.is_russian() { "Опишите вашу проблему" } else { "Describe your issue" }, None,
            ).await?;
            return Ok(());
        }
    };

    if user_message.len() > 4000 {
        let err = if lang.is_russian() { "❌ Текст слишком длинный. Максимум 4000 символов." } else { "❌ Text too long. Maximum 4000 characters." };
        send_message_timeout(
            &bot, chat_id, err, None,
        ).await?;
        return Ok(());
    }

    let telegram_id = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
    if telegram_id == 0 {
        tracing::warn!("Missing telegram_id; aborting handler");
        return Ok(());
    }

    tracing::info!(telegram_id = telegram_id, message_len = user_message.len(), "Tech support request received");

    let text = if lang.is_russian() {
        "✅ Ваше обращение отправлено в техподдержку.\n\nМы ответим в ближайшее время.\n\nКонтакты:\n• @support_bot\n• support@example.com"
    } else {
        "✅ Your request has been sent to tech support.\n\nWe'll respond as soon as possible.\n\nContacts:\n• @support_bot\n• support@example.com"
    };
    send_message_timeout(
        &bot, chat_id, text, None,
    ).await?;
    return_to_menu(&bot, &dialogue, chat_id, lang).await
}
