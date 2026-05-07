use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, ImageToVideoState};
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, load_lang_cb, return_to_menu};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_image_to_video_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    mut state: ImageToVideoState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    match state.step {
        0 => {
            let kb = InlineKeyboardMarkup::new(vec![
                vec![
                    InlineKeyboardButton::callback("Kling 1.6 (16:9)", "i2v:kling_16_9"),
                    InlineKeyboardButton::callback("Kling 1.6 (9:16)", "i2v:kling_9_16"),
                ],
                vec![
                    InlineKeyboardButton::callback("Runway Gen-3 (16:9)", "i2v:runway_16_9"),
                    InlineKeyboardButton::callback("Runway Gen-3 (9:16)", "i2v:runway_9_16"),
                ],
                vec![
                    InlineKeyboardButton::callback("Sora (16:9)", "i2v:sora_16_9"),
                    InlineKeyboardButton::callback("Sora (9:16)", "i2v:sora_9_16"),
                ],
                vec![
                    InlineKeyboardButton::callback(
                        if lang.is_russian() { "❌ Отмена" } else { "❌ Cancel" },
                        "i2v:cancel",
                    ),
                ],
            ]);
            let text = if lang.is_russian() {
                "🎥 Выберите модель и формат видео:"
            } else {
                "🎥 Choose model and video format:"
            };
            bot.send_message(msg.chat.id, text).reply_markup(kb).await?;
            state.step = 1;
            dialogue.update(Scene::ImageToVideo(state)).await?;
        }
        2 => {
            if let Some(photos) = msg.photo() {
                let file_id = photos.last().map(|p| p.file.id.clone()).unwrap_or_default();
                state.image_url = Some(file_id);
                state.step = 3;
                let text = if lang.is_russian() {
                    "✅ Изображение получено!\n\n📝 Опишите, что должно происходить в видео:"
                } else {
                    "✅ Image received!\n\n📝 Describe what should happen in the video:"
                };
                bot.send_message(msg.chat.id, text).await?;
                dialogue.update(Scene::ImageToVideo(state)).await?;
            } else {
                let text = if lang.is_russian() {
                    "🖼️ Пожалуйста, отправьте изображение."
                } else {
                    "🖼️ Please send an image."
                };
                bot.send_message(msg.chat.id, text).await?;
            }
        }
        3 => {
            if let Some(text) = msg.text() {
                if text.trim().len() < 3 {
                    let err = if lang.is_russian() { "Описание слишком короткое." } else { "Description too short." };
                    bot.send_message(msg.chat.id, err).await?;
                    return Ok(());
                }
                state.prompt = Some(text.to_string());
                state.step = 4;
                bot.send_message(msg.chat.id, trios_mb_i18n::t(lang, "processing")).await?;
                dialogue.update(Scene::ImageToVideo(state)).await?;
            }
        }
        _ => {}
    }
    Ok(())
}

pub async fn handle_image_to_video_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    mut state: ImageToVideoState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let chat_id = q.chat_id().unwrap();
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    match data {
        "i2v:cancel" => {
            return return_to_menu(&bot, &dialogue, chat_id, lang).await;
        }
        d if d.starts_with("i2v:") => {
            let model = match d {
                "i2v:kling_16_9" => ("kling-1.6", "16:9", 5u8),
                "i2v:kling_9_16" => ("kling-1.6", "9:16", 5),
                "i2v:runway_16_9" => ("runway-gen3", "16:9", 5),
                "i2v:runway_9_16" => ("runway-gen3", "9:16", 5),
                "i2v:sora_16_9" => ("sora", "16:9", 5),
                "i2v:sora_9_16" => ("sora", "9:16", 5),
                _ => ("kling-1.6", "9:16", 5),
            };
            state.model = Some(model.0.to_string());
            state.step = 2;
            let text = if lang.is_russian() {
                "🖼️ Теперь отправьте изображение для создания видео:"
            } else {
                "🖼️ Now send an image to create video:"
            };
            bot.send_message(chat_id, text).await?;
            dialogue.update(Scene::ImageToVideo(state)).await?;
        }
        _ => {}
    }
    Ok(())
}
