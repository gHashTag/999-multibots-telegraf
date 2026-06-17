use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, FaceSwapState};
use trios_mb_tg::HandlerResult;
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, deduct_balance, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const FACE_SWAP_COST: f64 = 10.0;

pub async fn handle_face_swap_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: FaceSwapState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let tid = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
    if tid == 0 {
        tracing::warn!("Missing telegram_id; aborting handler");
        return Ok(());
    }

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
                let file_id = match photos.last() {
                    Some(p) => p.file.id.clone(),
                    None => {
                        let err = if lang.is_russian() { "❌ Не удалось получить изображение." } else { "❌ Could not retrieve image." };
                        bot.send_message(msg.chat.id, err).await?;
                        return Ok(());
                    }
                };
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
                let file_id = match photos.last() {
                    Some(p) => p.file.id.clone(),
                    None => {
                        let err = if lang.is_russian() { "❌ Не удалось получить изображение." } else { "❌ Could not retrieve image." };
                        bot.send_message(msg.chat.id, err).await?;
                        return Ok(());
                    }
                };
                state.source_url = Some(file_id);

                if let Err(err_msg) = deduct_balance(&db, tid, FACE_SWAP_COST, lang).await {
                    bot.send_message(msg.chat.id, err_msg).await?;
                    return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                }

                return dispatch_and_reply(
                    &bot, &dialogue, msg.chat.id,
                    &job_queue, &db,
                    DispatchParams {
                        telegram_id: tid,
                        lang,
                        media_type: MediaType::FaceSwap,
                        job_type: "faceswap_rendering",
                        cost: 10.0,
                        prompt: None,
                        image_url: state.target_url.clone(),
                        model: None,
                    },
                ).await;
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
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    _state: FaceSwapState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    if data == "fs:cancel" {
        let chat_id = match q.chat_id() {
            Some(id) => id,
            None => return Ok(()),
        };
        return return_to_menu(&bot, &dialogue, chat_id, lang).await;
    }
    Ok(())
}
