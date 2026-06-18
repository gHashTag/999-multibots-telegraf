use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use trios_mb_tg::{answer_callback_query_timeout, send_message_timeout};
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
        "❌ Отмена генераций пока не поддерживается."
    } else {
        "❌ Cancelling generations is not yet supported."
    };
    send_message_timeout(&bot, msg.chat.id, text).await?;
    return_to_menu(&bot, &dialogue, msg.chat.id, lang).await
}

pub async fn handle_cancel_predictions_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    answer_callback_query_timeout(&bot, &q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let chat_id = match q.chat_id() {
        Some(id) => id,
        None => return Ok(()),
    };
    let text = if lang.is_russian() { "❌ Отмена генераций пока не поддерживается." } else { "❌ Cancelling generations is not yet supported." };
    send_message_timeout(&bot, chat_id, text).await?;
    return_to_menu(&bot, &dialogue, chat_id, lang).await
}
