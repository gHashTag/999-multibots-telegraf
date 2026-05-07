use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, ImprovePromptState};
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, load_lang_cb, return_to_menu};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_improve_prompt_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    mut state: ImprovePromptState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    if state.step == 0 {
        let text = if lang.is_russian() {
            "✨ Отправьте промпт для улучшения с помощью AI:"
        } else {
            "✨ Send a prompt to improve with AI:"
        };
        bot.send_message(msg.chat.id, text)
            .reply_markup(crate::generation_utils::back_cancel_keyboard(lang))
            .await?;
        state.step = 1;
        dialogue.update(Scene::ImprovePrompt(state)).await?;
        return Ok(());
    }

    if state.step == 1 {
        if let Some(text) = msg.text() {
            state.original_prompt = Some(text.to_string());
            state.step = 2;
            let processing = if lang.is_russian() {
                "⏳ Улучшаем промпт с помощью AI..."
            } else {
                "⏳ Improving prompt with AI..."
            };
            bot.send_message(msg.chat.id, processing).await?;
            dialogue.update(Scene::ImprovePrompt(state)).await?;
        } else {
            let err = if lang.is_russian() { "Отправьте текст" } else { "Send text" };
            bot.send_message(msg.chat.id, err).await?;
        }
    }

    Ok(())
}

pub async fn handle_improve_prompt_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    _state: ImprovePromptState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    if data == "ip:cancel" {
        return return_to_menu(&bot, &dialogue, q.chat_id().unwrap(), lang).await;
    }
    Ok(())
}
