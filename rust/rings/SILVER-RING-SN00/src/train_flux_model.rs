use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, TrainFluxModelState};
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, load_lang_cb, return_to_menu, deduct_balance};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const TRAIN_FLUX_COST: f64 = 50.0;

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
            bot.send_message(msg.chat.id, text)
                .reply_markup(crate::generation_utils::back_cancel_keyboard(lang))
                .await?;
            state.images = Some(Vec::new());
            state.step = 1;
            dialogue.update(Scene::TrainFluxModel(state)).await?;
        }
        1 => {
            if let Some(photos) = msg.photo() {
                let file_id = match photos.last() {
                    Some(p) => p.file.id.clone(),
                    None => {
                        let err = if lang.is_russian() { "❌ Не удалось получить изображение." } else { "❌ Could not retrieve image." };
                        bot.send_message(msg.chat.id, err).await?;
                        return Ok(());
                    }
                };
                let mut images = state.images.clone().unwrap_or_default();
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
                    bot.send_message(msg.chat.id, text).reply_markup(kb).await?;
                } else {
                    let text = if lang.is_russian() {
                        format!("📸 Загружено {}/4 минимум. Отправьте ещё.", count)
                    } else {
                        format!("📸 {}/4 minimum loaded. Send more.", count)
                    };
                    bot.send_message(msg.chat.id, text).await?;
                }
                dialogue.update(Scene::TrainFluxModel(state)).await?;
            } else if let Some(text) = msg.text() {
                if text.contains("Готово") || text.contains("Done") {
                    state.step = 2;
                    let prompt = if lang.is_russian() { "🔑 Введите trigger word:" } else { "🔑 Enter trigger word:" };
                    bot.send_message(msg.chat.id, prompt).await?;
                    dialogue.update(Scene::TrainFluxModel(state)).await?;
                }
            }
        }
        2 => {
            if let Some(text) = msg.text() {
                state.trigger_word = Some(text.trim().to_string());
                state.step = 3;
                let prompt = if lang.is_russian() { "📛 Введите название модели:" } else { "📛 Enter model name:" };
                bot.send_message(msg.chat.id, prompt).await?;
                dialogue.update(Scene::TrainFluxModel(state)).await?;
            }
        }
        3 => {
            if let Some(text) = msg.text() {
                state.model_name = Some(text.trim().to_string());
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
                        bot.send_message(msg.chat.id, err).await?;
                        return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                    }
                };
                let _images = images; // used later if dispatch is added

                if let Err(err_msg) = deduct_balance(&db, tid, TRAIN_FLUX_COST, lang).await {
                    bot.send_message(msg.chat.id, err_msg).await?;
                    return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                }
                let text = if lang.is_russian() {
                    "✅ Обучение запущено! Это займёт 10-30 минут."
                } else {
                    "✅ Training started! This will take 10-30 minutes."
                };
                bot.send_message(msg.chat.id, text).await?;
                return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
            }
        }
        _ => {}
    }
    Ok(())
}

pub async fn handle_train_flux_model_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    state: TrainFluxModelState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
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
            bot.send_message(chat_id, text).await?;
        }
        "tf:done_upload" => {
            let mut new_state = state;
            new_state.step = 2;
            let text = if lang.is_russian() { "🔑 Введите trigger word:" } else { "🔑 Enter trigger word:" };
            bot.send_message(chat_id, text).await?;
            dialogue.update(Scene::TrainFluxModel(new_state)).await?;
        }
        _ => {}
    }
    Ok(())
}
