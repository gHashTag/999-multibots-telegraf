use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, VoiceAvatarState};
use trios_mb_tg::HandlerResult;
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_voice_avatar_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: VoiceAvatarState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    if state.step == 0 {
        let text = if lang.is_russian() {
            "🎙️ Отправьте голосовое сообщение для создания голосового аватара"
        } else {
            "🎙️ Send a voice message to create your voice avatar"
        };
        bot.send_message(msg.chat.id, text)
            .reply_markup(crate::generation_utils::back_cancel_keyboard(lang))
            .await?;
        state.step = 1;
        dialogue.update(Scene::VoiceAvatar(state)).await?;
        return Ok(());
    }

    if state.step == 1 {
        let file_id = if let Some(voice) = msg.voice() {
            Some(voice.file.id.clone())
        } else { msg.audio().map(|audio| audio.file.id.clone()) };

        if let Some(fid) = file_id {
            state.audio_url = Some(fid);
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
                    media_type: MediaType::Audio,
                    job_type: "voice_cloning",
                    cost: 10.0,
                    prompt: None,
                    image_url: state.audio_url.clone(),
                    model: None,
                },
            ).await;
        } else {
            let text = if lang.is_russian() {
                "🎙️ Пожалуйста, отправьте голосовое сообщение"
            } else {
                "🎙️ Please send a voice message"
            };
            bot.send_message(msg.chat.id, text).await?;
        }
    }

    Ok(())
}

pub async fn handle_voice_avatar_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    _state: VoiceAvatarState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    if data == "va:cancel" {
        return return_to_menu(&bot, &dialogue, q.chat_id().unwrap(), lang).await;
    }
    Ok(())
}
