use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, SelectModelState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::{answer_callback_query_timeout, send_message_timeout, dialogue_update_timeout};
use crate::generation_utils::{load_lang, load_lang_cb, return_to_menu};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const DB_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

#[tracing::instrument(skip_all)]
pub async fn handle_select_model_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    mut state: SelectModelState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    if state.step == 0 {
        let kb = InlineKeyboardMarkup::new(vec![
            vec![
                InlineKeyboardButton::callback("GPT-4o", "sm:gpt4o"),
                InlineKeyboardButton::callback("Claude 3.5", "sm:claude"),
            ],
            vec![
                InlineKeyboardButton::callback("Gemini Pro", "sm:gemini"),
                InlineKeyboardButton::callback("Llama 3", "sm:llama"),
            ],
            vec![InlineKeyboardButton::callback(
                if lang.is_russian() { "❌ Отмена" } else { "❌ Cancel" },
                "sm:cancel",
            )],
        ]);
        let text = if lang.is_russian() {
            "🤖 Выберите языковую модель аватара:"
        } else {
            "🤖 Select avatar language model:"
        };
        send_message_timeout(&bot, msg.chat.id, text, Some(kb.into())).await?;
        state.step = 1;
        dialogue_update_timeout(&dialogue, Scene::SelectModel(state)).await?;
    }

    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_select_model_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    _state: SelectModelState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    answer_callback_query_timeout(&bot, &q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let chat_id = match q.chat_id() {
        Some(id) => id,
        None => return Ok(()),
    };
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };
    let tid = q.from.id.0 as i64;
    if tid <= 0 {
        tracing::warn!("Callback query missing valid telegram_id; aborting select_model handler");
        return Ok(());
    }

    match data {
        "sm:cancel" => {
            return return_to_menu(&bot, &dialogue, chat_id, lang).await;
        }
        d if d.starts_with("sm:") => {
            let model = match d {
                "sm:gpt4o" => "gpt-4o",
                "sm:claude" => "claude-3.5-sonnet",
                "sm:gemini" => "gemini-pro",
                "sm:llama" => "llama-3",
                _ => "gpt-4o",
            };
            match tokio::time::timeout(DB_TIMEOUT, db.update_user_model(tid, model)).await {
                Ok(Ok(())) => {}
                Ok(Err(e)) => {
                    tracing::error!(telegram_id = tid, error = %e, "Failed to update user model");
                }
                Err(_) => {
                    tracing::warn!(telegram_id = tid, "DB timeout updating user model");
                }
            }
            let text = if lang.is_russian() {
                format!("✅ Модель выбрана: {}", model)
            } else {
                format!("✅ Model selected: {}", model)
            };
            send_message_timeout(&bot, chat_id, text, None).await?;
            return return_to_menu(&bot, &dialogue, chat_id, lang).await;
        }
        _ => {}
    }
    Ok(())
}
