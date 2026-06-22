use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, HedraRenderState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::{answer_callback_query_timeout, dialogue_update_timeout, send_message_timeout};
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, deduct_balance, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const HEDRA_RENDER_COST: f64 = 30.0;
const MAX_DIALOGUE_TEXT_LEN: usize = 2000;
const MAX_HEDRA_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_HEDRA_VOICE_BYTES: u64 = 50 * 1024 * 1024;

#[tracing::instrument(skip_all)]
pub async fn handle_hedra_render_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: HedraRenderState,
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
                "🎬 Hedra Render\n\nОтправьте изображение (лицо).\n\nСтоимость: 30 ⭐"
            } else {
                "🎬 Hedra Render\n\nSend an image (face).\n\nCost: 30 ⭐"
            };
            send_message_timeout(
                &bot, msg.chat.id, text,
                Some(crate::generation_utils::back_cancel_keyboard(lang).into()),
            ).await?;
            state.step = 1;
            dialogue_update_timeout(
                &dialogue, Scene::HedraRender(state)).await?;
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
                if let Some(p) = photos.last() {
                    if p.file.size as u64 > MAX_HEDRA_IMAGE_BYTES {
                        let err = if lang.is_russian() {
                            format!("❌ Изображение слишком большое. Максимум {} МБ.", MAX_HEDRA_IMAGE_BYTES / 1024 / 1024)
                        } else {
                            format!("❌ Image is too large. Maximum {} MB.", MAX_HEDRA_IMAGE_BYTES / 1024 / 1024)
                        };
                        send_message_timeout(
                            &bot, msg.chat.id, err, None,
                        ).await?;
                        return Ok(());
                    }
                }
                state.image_url = Some(file_id);
                state.step = 2;
                let text = if lang.is_russian() {
                    "✅ Изображение получено!\n\nТеперь отправьте текст или аудио для анимации."
                } else {
                    "✅ Image received!\n\nNow send text or audio for animation."
                };
                send_message_timeout(
                    &bot, msg.chat.id, text, None,
                ).await?;
                dialogue_update_timeout(
                    &dialogue, Scene::HedraRender(state)).await?;
            } else {
                let text = if lang.is_russian() { "❌ Отправьте изображение." } else { "❌ Send an image." };
                send_message_timeout(
                    &bot, msg.chat.id, text, None,
                ).await?;
            }
        }
        2 => {
            if let Some(text) = msg.text() {
                if text.trim().is_empty() {
                    let err = if lang.is_russian() { "✍️ Введите текст" } else { "✍️ Enter text" };
                    send_message_timeout(
                        &bot, msg.chat.id, err, None,
                    ).await?;
                    return Ok(());
                }

                if text.len() > MAX_DIALOGUE_TEXT_LEN {
                    let err = if lang.is_russian() { "❌ Текст слишком длинный. Максимум 2000 символов." } else { "❌ Text too long. Maximum 2000 characters." };
                    send_message_timeout(
                        &bot, msg.chat.id, err, None,
                    ).await?;
                    return Ok(());
                }

                if let Err(err_msg) = deduct_balance(&db, tid, HEDRA_RENDER_COST, lang).await {
                    send_message_timeout(
                        &bot, msg.chat.id, err_msg, None,
                    ).await?;
                    return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                }
                state.text = Some(text.to_string());

                return dispatch_and_reply(
                    &bot, &dialogue, msg.chat.id,
                    &job_queue, &db,
                    DispatchParams {
                        telegram_id: tid,
                        lang,
                        media_type: MediaType::Video,
                        job_type: "video_rendering",
                        cost: 10.0,
                        prompt: state.text.clone(),
                        image_url: state.image_url.clone(),
                        model: None,
                    },
                ).await;
            } else if let Some(voice) = msg.voice() {
                if voice.file.size as u64 > MAX_HEDRA_VOICE_BYTES {
                    let err = if lang.is_russian() {
                        format!("❌ Голосовое сообщение слишком большое. Максимум {} МБ.", MAX_HEDRA_VOICE_BYTES / 1024 / 1024)
                    } else {
                        format!("❌ Voice message is too large. Maximum {} MB.", MAX_HEDRA_VOICE_BYTES / 1024 / 1024)
                    };
                    send_message_timeout(
                        &bot, msg.chat.id, err, None,
                    ).await?;
                    return Ok(());
                }
                if let Err(err_msg) = deduct_balance(&db, tid, HEDRA_RENDER_COST, lang).await {
                    send_message_timeout(
                        &bot, msg.chat.id, err_msg, None,
                    ).await?;
                    return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                }
                state.audio_url = Some(voice.file.id.clone());

                return dispatch_and_reply(
                    &bot, &dialogue, msg.chat.id,
                    &job_queue, &db,
                    DispatchParams {
                        telegram_id: tid,
                        lang,
                        media_type: MediaType::Video,
                        job_type: "video_rendering",
                        cost: 10.0,
                        prompt: None,
                        image_url: state.image_url.clone(),
                        model: None,
                    },
                ).await;
            } else {
                let text = if lang.is_russian() { "✍️ Отправьте текст или аудио" } else { "✍️ Send text or audio" };
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
pub async fn handle_hedra_render_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    _state: HedraRenderState,
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

    if data == "hedra:cancel" {
        let chat_id = match q.chat_id() {
            Some(id) => id,
            None => return Ok(()),
        };
        return return_to_menu(&bot, &dialogue, chat_id, lang).await;
    }
    Ok(())
}
