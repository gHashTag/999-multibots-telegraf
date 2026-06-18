use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, RemoveBgState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::{answer_callback_query_timeout, dialogue_update_timeout, send_message_timeout};
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, deduct_balance, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const REMOVE_BG_COST: f64 = 5.0;

#[tracing::instrument(skip_all)]
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
            send_message_timeout(
                &bot, msg.chat.id, text,
                Some(crate::generation_utils::back_cancel_keyboard(lang).into()),
            ).await?;
            state.step = 1;
            dialogue_update_timeout(
                &dialogue, Scene::RemoveBg(state)).await?;
        }
        1 => {
            if let Some(photos) = msg.photo() {
                let file_id = match photos.last() {
                    Some(p) => p.file.id.clone(),
                    None => {
                        let err = if lang.is_russian() { "❌ Не удалось получить изображение." } else { "❌ Could not retrieve image." };
                        send_message_timeout(
                            &bot, msg.chat.id, err, None,
                        ).await?;
                        return Ok(());
                    }
                };

                if let Err(err_msg) = deduct_balance(&db, tid, REMOVE_BG_COST, lang).await {
                    send_message_timeout(
                        &bot, msg.chat.id, err_msg, None,
                    ).await?;
                    return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                }
                state.image_url = Some(file_id);

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
                send_message_timeout(
                    &bot, msg.chat.id, text, None,
                ).await?;
            }
        }
        _ => {}
    }
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_remove_bg_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    _state: RemoveBgState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    answer_callback_query_timeout(&bot, &q.id).await?;
    let tid = q.from.id.0 as i64;
    if tid <= 0 {
        tracing::warn!("Callback query missing valid telegram_id; aborting handler");
        return Ok(());
    }

    let lang = load_lang_cb(&db, &q).await;
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    if data == "rbg:cancel" {
        let chat_id = match q.chat_id() {
            Some(id) => id,
            None => return Ok(()),
        };
        return return_to_menu(&bot, &dialogue, chat_id, lang).await;
    }
    Ok(())
}
