use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, TrainFluxModelState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::{answer_callback_query_timeout, send_message_timeout, dialogue_update_timeout};
use crate::generation_utils::{load_lang, load_lang_cb, return_to_menu, deduct_balance};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const TRAIN_FLUX_COST: f64 = 50.0;
const MAX_TRAIN_IMAGES: usize = 20;
const MAX_TRAIN_FLUX_PHOTO_BYTES: u64 = 20 * 1024 * 1024;

#[tracing::instrument(skip_all)]
pub async fn handle_train_flux_model_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    mut state: TrainFluxModelState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    match state.step {
        0 => {
            let text = if lang.is_russian() {
                "🔥 Обучение Flux LoRA модели\n\nОтправьте изображения для обучения (по одному).\n\nОтправьте первое изображение:"
            } else {
                "🔥 Train Flux LoRA Model\n\nSend training images (one at a time).\n\nSend the first image:"
            };
            send_message_timeout(&bot, msg.chat.id, text, Some(crate::generation_utils::back_cancel_keyboard(lang).into())).await?;
            state.images = Some(Vec::new());
            state.step = 1;
            dialogue_update_timeout(&dialogue, Scene::TrainFluxModel(state)).await?;
        }
        1 => {
            if let Some(photos) = msg.photo() {
                let photo = match photos.last() {
                    Some(p) => p,
                    None => {
                        let err = if lang.is_russian() { "❌ Не удалось получить изображение." } else { "❌ Could not retrieve image." };
                        send_message_timeout(&bot, msg.chat.id, err, None).await?;
                        return Ok(());
                    }
                };
                if photo.file.size as u64 > MAX_TRAIN_FLUX_PHOTO_BYTES {
                    let err = if lang.is_russian() { "❌ Изображение слишком большое. Максимум 20 МБ." } else { "❌ Image too large. Maximum 20 MB." };
                    send_message_timeout(&bot, msg.chat.id, err, None).await?;
                    return Ok(());
                }
                let file_id = photo.file.id.clone();
                let mut images = match state.images.as_ref() {
                    Some(imgs) => imgs.clone(),
                    None => {
                        let err = if lang.is_russian() { "❌ Сессия устарела. Отправьте изображения заново." } else { "❌ Session expired. Please send images again." };
                        send_message_timeout(&bot, msg.chat.id, err, None).await?;
                        return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                    }
                };
                if images.len() >= MAX_TRAIN_IMAGES {
                    let err = if lang.is_russian() {
                        format!("❌ Максимум {} изображений для обучения.", MAX_TRAIN_IMAGES)
                    } else {
                        format!("❌ Maximum {} images allowed for training.", MAX_TRAIN_IMAGES)
                    };
                    send_message_timeout(&bot, msg.chat.id, err, None).await?;
                    return Ok(());
                }
                images.push(file_id);
                state.images = Some(images.clone());

                let count = images.len();
                if count >= 4 {
                    let kb = InlineKeyboardMarkup::new(vec![
                        vec![InlineKeyboardButton::callback(
                            if lang.is_russian() { "✅ Начать обучение" } else { "✅ Start training" },
                            "tf:done_upload",
                        )],
                        vec![InlineKeyboardButton::callback(
                            if lang.is_russian() { "➕ Добавить ещё" } else { "➕ Add more" },
                            "tf:more",
                        )],
                    ]);
                    let text = if lang.is_russian() {
                        format!("📸 Загружено {} изображений. Минимум достигнут.", count)
                    } else {
                        format!("📸 {} images uploaded. Minimum reached.", count)
                    };
                    send_message_timeout(&bot, msg.chat.id, text, Some(kb.into())).await?;
                } else {
                    let text = if lang.is_russian() {
                        format!("📸 Загружено {}/4 минимум. Отправьте ещё.", count)
                    } else {
                        format!("📸 {}/4 minimum loaded. Send more.", count)
                    };
                    send_message_timeout(&bot, msg.chat.id, text, None).await?;
                }
                dialogue_update_timeout(&dialogue, Scene::TrainFluxModel(state)).await?;
            } else if let Some(text) = msg.text() {
                if text.contains("Готово") || text.contains("Done") {
                    state.step = 2;
                    let prompt = if lang.is_russian() { "🔑 Введите trigger word:" } else { "🔑 Enter trigger word:" };
                    send_message_timeout(&bot, msg.chat.id, prompt, None).await?;
                    dialogue_update_timeout(&dialogue, Scene::TrainFluxModel(state)).await?;
                }
            }
        }
        2 => {
            if let Some(text) = msg.text() {
                const MAX_TRIGGER_WORD_LEN: usize = 64;
                let trimmed = text.trim();
                if trimmed.is_empty() {
                    let err = if lang.is_russian() { "❌ Trigger word не может быть пустым." } else { "❌ Trigger word cannot be empty." };
                    send_message_timeout(&bot, msg.chat.id, err, None).await?;
                    return Ok(());
                }
                if trimmed.len() > MAX_TRIGGER_WORD_LEN {
                    let err = if lang.is_russian() { "❌ Trigger word слишком длинный." } else { "❌ Trigger word too long." };
                    send_message_timeout(&bot, msg.chat.id, err, None).await?;
                    return Ok(());
                }
                state.trigger_word = Some(trimmed.to_string());
                state.step = 3;
                let prompt = if lang.is_russian() { "📛 Введите название модели:" } else { "📛 Enter model name:" };
                send_message_timeout(&bot, msg.chat.id, prompt, None).await?;
                dialogue_update_timeout(&dialogue, Scene::TrainFluxModel(state)).await?;
            }
        }
        3 => {
            if let Some(text) = msg.text() {
                const MAX_MODEL_NAME_LEN: usize = 64;
                let trimmed = text.trim();
                if trimmed.is_empty() {
                    let err = if lang.is_russian() { "❌ Название модели не может быть пустым." } else { "❌ Model name cannot be empty." };
                    send_message_timeout(&bot, msg.chat.id, err, None).await?;
                    return Ok(());
                }
                if trimmed.len() > MAX_MODEL_NAME_LEN {
                    let err = if lang.is_russian() { "❌ Название модели слишком длинное." } else { "❌ Model name too long." };
                    send_message_timeout(&bot, msg.chat.id, err, None).await?;
                    return Ok(());
                }
                state.model_name = Some(trimmed.to_string());
                state.step = 4;
                let tid = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
    if tid == 0 {
        tracing::warn!("Missing telegram_id; aborting handler");
        return Ok(());
    }

                let images = match state.images.as_ref() {
                    Some(imgs) if imgs.len() >= 4 => imgs,
                    _ => {
                        let err = if lang.is_russian() { "❌ Нужно минимум 4 изображения." } else { "❌ Need at least 4 images." };
                        send_message_timeout(&bot, msg.chat.id, err, None).await?;
                        return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                    }
                };
                let _images = images; // used later if dispatch is added

                if let Err(err_msg) = deduct_balance(&db, tid, TRAIN_FLUX_COST, lang).await {
                    send_message_timeout(&bot, msg.chat.id, err_msg, None).await?;
                    return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                }
                let text = if lang.is_russian() {
                    "✅ Обучение запущено! Это займёт 10-30 минут."
                } else {
                    "✅ Training started! This will take 10-30 minutes."
                };
                send_message_timeout(&bot, msg.chat.id, text, None).await?;
                return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
            }
        }
        _ => {}
    }
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_train_flux_model_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    state: TrainFluxModelState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    answer_callback_query_timeout(&bot, &q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let chat_id = match q.chat_id() {
        Some(id) => id,
        None => return Ok(()),
    };
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    match data {
        "tf:cancel" => {
            return return_to_menu(&bot, &dialogue, chat_id, lang).await;
        }
        "tf:more" => {
            let text = if lang.is_russian() { "📸 Отправьте следующее изображение:" } else { "📸 Send next image:" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        "tf:done_upload" => {
            let mut new_state = state;
            new_state.step = 2;
            let text = if lang.is_russian() { "🔑 Введите trigger word:" } else { "🔑 Enter trigger word:" };
            send_message_timeout(&bot, chat_id, text, None).await?;
            dialogue_update_timeout(&dialogue, Scene::TrainFluxModel(new_state)).await?;
        }
        _ => {}
    }
    Ok(())
}
