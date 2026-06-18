use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, SelectModelState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::answer_callback_query_timeout;
use crate::generation_utils::{load_lang, load_lang_cb, return_to_menu};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

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
        bot.send_message(msg.chat.id, text).reply_markup(kb).await?;
        state.step = 1;
        dialogue.update(Scene::SelectModel(state)).await?;
    }

    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_select_model_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    mut state: SelectModelState,
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
            state.selected_model = Some(model.to_string());
            if let Err(e) = db.update_user_model(tid, model).await {
                tracing::error!(telegram_id = tid, error = %e, "Failed to update user model");
            }
            let text = if lang.is_russian() {
                format!("✅ Модель выбрана: {}", model)
            } else {
                format!("✅ Model selected: {}", model)
            };
            bot.send_message(chat_id, text).await?;
            return return_to_menu(&bot, &dialogue, chat_id, lang).await;
        }
        _ => {}
    }
    Ok(())
}
