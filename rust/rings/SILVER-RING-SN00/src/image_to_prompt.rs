use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, ImageToPromptState};
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, load_lang_cb, return_to_menu};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_image_to_prompt_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    mut state: ImageToPromptState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    if state.step == 0 {
        let text = if lang.is_russian() {
            "🖼️ Отправьте изображение для распознавания промпта"
        } else {
            "🖼️ Send an image to recognize the prompt"
        };
        bot.send_message(msg.chat.id, text)
            .reply_markup(crate::generation_utils::back_cancel_keyboard(lang))
            .await?;
        state.step = 1;
        dialogue.update(Scene::ImageToPrompt(state)).await?;
        return Ok(());
    }

    if state.step == 1 {
        if let Some(photos) = msg.photo() {
            let file_id = photos.last().map(|p| p.file.id.clone()).unwrap_or_default();
            state.image_url = Some(file_id);
            state.step = 2;

            let processing = if lang.is_russian() {
                "Генерирую промпт для вашего изображения..."
            } else {
                "Generating prompt for your image..."
            };
            bot.send_message(msg.chat.id, processing).await?;
            dialogue.update(Scene::ImageToPrompt(state)).await?;
        } else {
            let text = if lang.is_russian() { "Пожалуйста, отправьте изображение" } else { "Please send an image" };
            bot.send_message(msg.chat.id, text).await?;
        }
    }

    Ok(())
}

pub async fn handle_image_to_prompt_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    _state: ImageToPromptState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    if data == "i2p:cancel" {
        return return_to_menu(&bot, &dialogue, q.chat_id().unwrap(), lang).await;
    }
    Ok(())
}
