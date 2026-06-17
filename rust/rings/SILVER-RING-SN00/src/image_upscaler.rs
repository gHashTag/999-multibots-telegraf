use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, UpscalerState};
use trios_mb_tg::HandlerResult;
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_image_upscaler_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: UpscalerState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    if state.step == 0 {
        let text = if lang.is_russian() {
            "⬆️ Отправьте фото для увеличения качества\n\n🎯 Clarity Upscaler увеличит разрешение в 2 раза\n💎 Стоимость: 3 ⭐"
        } else {
            "⬆️ Send a photo to upscale quality\n\n🎯 Clarity Upscaler will increase resolution 2x\n💎 Cost: 3 ⭐"
        };
        bot.send_message(msg.chat.id, text)
            .reply_markup(crate::generation_utils::back_cancel_keyboard(lang))
            .await?;
        state.step = 1;
        dialogue.update(Scene::ImageUpscaler(state)).await?;
        return Ok(());
    }

    if state.step == 1 {
        if let Some(photos) = msg.photo() {
            let file_id = match photos.last() {
                Some(p) => p.file.id.clone(),
                None => {
                    let err = if lang.is_russian() { "❌ Не удалось получить изображение." } else { "❌ Could not retrieve image." };
                    bot.send_message(msg.chat.id, err).await?;
                    return Ok(());
                }
            };
            state.image_url = Some(file_id);
            state.scale = Some(2);
            let tid = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
    if tid == 0 {
        tracing::warn!("Missing telegram_id; aborting handler");
        return Ok(());
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
            let text = if lang.is_russian() { "Пожалуйста, отправьте изображение" } else { "Please send an image" };
            bot.send_message(msg.chat.id, text).await?;
        }
    }

    Ok(())
}

pub async fn handle_image_upscaler_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    _state: UpscalerState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    if data == "up:cancel" {
        return return_to_menu(&bot, &dialogue, q.chat_id().unwrap(), lang).await;
    }
    Ok(())
}
