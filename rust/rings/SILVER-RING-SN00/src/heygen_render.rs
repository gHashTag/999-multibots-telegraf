use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, HeygenRenderState};
use trios_mb_tg::HandlerResult;
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, deduct_balance, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const HEYGEN_RENDER_COST: f64 = 50.0;

pub async fn handle_heygen_render_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: HeygenRenderState,
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
                "🎥 HeyGen Render\n\nВведите ID аватара.\n\nСтоимость: 50 ⭐"
            } else {
                "🎥 HeyGen Render\n\nEnter avatar ID.\n\nCost: 50 ⭐"
            };
            bot.send_message(msg.chat.id, text)
                .reply_markup(crate::generation_utils::back_cancel_keyboard(lang))
                .await?;
            state.step = 1;
            dialogue.update(Scene::HeygenRender(state)).await?;
        }
        1 => {
            if let Some(text) = msg.text() {
                if text.trim().is_empty() {
                    let err = if lang.is_russian() { "✍️ Введите ID аватара" } else { "✍️ Enter avatar ID" };
                    bot.send_message(msg.chat.id, err).await?;
                    return Ok(());
                }
                state.avatar_id = Some(text.to_string());
                state.step = 2;
                let text = if lang.is_russian() {
                    "✅ ID аватара сохранён!\n\nТеперь введите текст для озвучки."
                } else {
                    "✅ Avatar ID saved!\n\nNow enter the text for speech."
                };
                bot.send_message(msg.chat.id, text).await?;
                dialogue.update(Scene::HeygenRender(state)).await?;
            } else {
                let text = if lang.is_russian() { "✍️ Введите ID аватара" } else { "✍️ Enter avatar ID" };
                bot.send_message(msg.chat.id, text).await?;
            }
        }
        2 => {
            if let Some(text) = msg.text() {
                if text.trim().is_empty() {
                    let err = if lang.is_russian() { "✍️ Введите текст" } else { "✍️ Enter text" };
                    bot.send_message(msg.chat.id, err).await?;
                    return Ok(());
                }

                if let Err(err_msg) = deduct_balance(&db, tid, HEYGEN_RENDER_COST, lang).await {
                    bot.send_message(msg.chat.id, err_msg).await?;
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
                        image_url: None,
                        model: None,
                    },
                ).await;
            } else {
                let text = if lang.is_russian() { "✍️ Введите текст" } else { "✍️ Enter text" };
                bot.send_message(msg.chat.id, text).await?;
            }
        }
        _ => {}
    }
    Ok(())
}

pub async fn handle_heygen_render_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    _state: HeygenRenderState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    if data == "heygen:cancel" {
        let chat_id = match q.chat_id() {
            Some(id) => id,
            None => return Ok(()),
        };
        return return_to_menu(&bot, &dialogue, chat_id, lang).await;
    }
    Ok(())
}
