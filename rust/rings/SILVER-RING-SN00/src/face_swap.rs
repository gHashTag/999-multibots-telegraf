use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, FaceSwapState};
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, load_lang_cb, return_to_menu, check_balance, deduct_balance};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const FACE_SWAP_COST: f64 = 10.0;

pub async fn handle_face_swap_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    mut state: FaceSwapState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let tid = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);

    match state.step {
        0 => {
            let text = if lang.is_russian() {
                "🎭 Замена лица\n\nЗагрузите фото человека, на которого хотите заменить лицо.\n\nСтоимость: 10 ⭐"
            } else {
                "🎭 Face Swap\n\nUpload photo of the person whose face you want to swap.\n\nCost: 10 ⭐"
            };
            bot.send_message(msg.chat.id, text)
                .reply_markup(crate::generation_utils::back_cancel_keyboard(lang))
                .await?;
            state.step = 1;
            dialogue.update(Scene::FaceSwap(state)).await?;
        }
        1 => {
            if let Some(photos) = msg.photo() {
                let file_id = photos.last().map(|p| p.file.id.clone()).unwrap_or_default();
                state.target_url = Some(file_id);
                state.step = 2;
                let text = if lang.is_russian() {
                    "✅ Фото получено!\n\nТеперь загрузите второе фото - с лицом, которое нужно использовать."
                } else {
                    "✅ Photo received!\n\nNow upload the second photo - with the face to use."
                };
                bot.send_message(msg.chat.id, text).await?;
                dialogue.update(Scene::FaceSwap(state)).await?;
            } else {
                let text = if lang.is_russian() { "❌ Отправьте фото." } else { "❌ Send a photo." };
                bot.send_message(msg.chat.id, text).await?;
            }
        }
        2 => {
            if let Some(photos) = msg.photo() {
                let file_id = photos.last().map(|p| p.file.id.clone()).unwrap_or_default();
                state.source_url = Some(file_id);

                if let Err(err_msg) = check_balance(&db, tid, FACE_SWAP_COST, lang).await {
                    bot.send_message(msg.chat.id, err_msg).await?;
                    return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                }

                let _ = deduct_balance(&db, tid, FACE_SWAP_COST).await;
                state.step = 3;

                let processing = if lang.is_russian() {
                    "⏳ Обрабатываем замену лица..."
                } else {
                    "⏳ Processing face swap..."
                };
                bot.send_message(msg.chat.id, processing).await?;
                dialogue.update(Scene::FaceSwap(state)).await?;
            } else {
                let text = if lang.is_russian() { "❌ Отправьте фото." } else { "❌ Send a photo." };
                bot.send_message(msg.chat.id, text).await?;
            }
        }
        _ => {}
    }
    Ok(())
}

pub async fn handle_face_swap_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    _state: FaceSwapState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    if data == "fs:cancel" {
        return return_to_menu(&bot, &dialogue, q.chat_id().unwrap(), lang).await;
    }
    Ok(())
}
