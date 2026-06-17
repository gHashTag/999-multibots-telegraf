use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, RemoveBgState};
use trios_mb_tg::HandlerResult;
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, check_balance, deduct_balance, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const REMOVE_BG_COST: f64 = 5.0;

pub async fn handle_remove_bg_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: RemoveBgState,
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
                "🖼️ Удаление фона\n\nОтправьте фото для удаления фона.\n\nСтоимость: 5 ⭐"
            } else {
                "🖼️ Remove Background\n\nSend a photo to remove its background.\n\nCost: 5 ⭐"
            };
            bot.send_message(msg.chat.id, text)
                .reply_markup(crate::generation_utils::back_cancel_keyboard(lang))
                .await?;
            state.step = 1;
            dialogue.update(Scene::RemoveBg(state)).await?;
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

                if let Err(err_msg) = check_balance(&db, tid, REMOVE_BG_COST, lang).await {
                    bot.send_message(msg.chat.id, err_msg).await?;
                    return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                }

                state.image_url = Some(file_id);
                if !deduct_balance(&db, tid, REMOVE_BG_COST).await {
                    tracing::error!(telegram_id = tid, "Failed to deduct balance for remove bg");
                    let err_text = if lang.is_russian() {
                        "❌ Ошибка списания средств. Попробуйте позже."
                    } else {
                        "❌ Failed to deduct balance. Please try again later."
                    };
                    bot.send_message(msg.chat.id, err_text).await?;
                    return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                }

                return dispatch_and_reply(
                    &bot, &dialogue, msg.chat.id,
                    &job_queue, &db,
                    DispatchParams {
                        telegram_id: tid,
                        lang,
                        media_type: MediaType::Upscale,
                        job_type: "upscaling",
                        cost: 10.0,
                        prompt: None,
                        image_url: state.image_url.clone(),
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

pub async fn handle_remove_bg_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    _state: RemoveBgState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    if data == "rbg:cancel" {
        return return_to_menu(&bot, &dialogue, q.chat_id().unwrap(), lang).await;
    }
    Ok(())
}
