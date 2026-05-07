use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, AiPhotoshopState};
use trios_mb_tg::HandlerResult;
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, check_balance, deduct_balance, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const AI_PHOTOSHOP_COST: f64 = 10.0;

pub async fn handle_ai_photoshop_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: AiPhotoshopState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let tid = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);

    match state.step {
        0 => {
            let text = if lang.is_russian() {
                "🎨 AI Photoshop\n\nОтправьте изображение для редактирования.\n\nСтоимость: 10 ⭐"
            } else {
                "🎨 AI Photoshop\n\nSend an image to edit.\n\nCost: 10 ⭐"
            };
            bot.send_message(msg.chat.id, text)
                .reply_markup(crate::generation_utils::back_cancel_keyboard(lang))
                .await?;
            state.step = 1;
            dialogue.update(Scene::AiPhotoshop(state)).await?;
        }
        1 => {
            if let Some(photos) = msg.photo() {
                let file_id = photos.last().map(|p| p.file.id.clone()).unwrap_or_default();
                state.image_url = Some(file_id);
                state.step = 2;
                let text = if lang.is_russian() {
                    "✅ Изображение получено!\n\nТеперь опишите, что хотите изменить."
                } else {
                    "✅ Image received!\n\nNow describe what you want to change."
                };
                bot.send_message(msg.chat.id, text).await?;
                dialogue.update(Scene::AiPhotoshop(state)).await?;
            } else {
                let text = if lang.is_russian() { "❌ Отправьте изображение." } else { "❌ Send an image." };
                bot.send_message(msg.chat.id, text).await?;
            }
        }
        2 => {
            if let Some(text) = msg.text() {
                if text.trim().is_empty() {
                    let err = if lang.is_russian() { "✍️ Введите промпт" } else { "✍️ Enter a prompt" };
                    bot.send_message(msg.chat.id, err).await?;
                    return Ok(());
                }

                if let Err(err_msg) = check_balance(&db, tid, AI_PHOTOSHOP_COST, lang).await {
                    bot.send_message(msg.chat.id, err_msg).await?;
                    return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                }

                state.prompt = Some(text.to_string());
                let _ = deduct_balance(&db, tid, AI_PHOTOSHOP_COST).await;

                return dispatch_and_reply(
                    &bot, &dialogue, msg.chat.id,
                    &job_queue, &db,
                    DispatchParams {
                        telegram_id: tid,
                        lang,
                        media_type: MediaType::Image,
                        job_type: "image_rendering",
                        prompt: state.prompt.clone(),
                        image_url: state.image_url.clone(),
                        model: None,
                    },
                ).await;
            } else {
                let text = if lang.is_russian() { "✍️ Введите промпт" } else { "✍️ Enter a prompt" };
                bot.send_message(msg.chat.id, text).await?;
            }
        }
        _ => {}
    }
    Ok(())
}

pub async fn handle_ai_photoshop_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    _state: AiPhotoshopState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    if data == "aiph:cancel" {
        return return_to_menu(&bot, &dialogue, q.chat_id().unwrap(), lang).await;
    }
    Ok(())
}
