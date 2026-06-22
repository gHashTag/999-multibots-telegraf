use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, VoiceAvatarState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::{answer_callback_query_timeout, send_message_timeout, dialogue_update_timeout};
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const MAX_VOICE_AVATAR_AUDIO_BYTES: u64 = 50 * 1024 * 1024;

#[tracing::instrument(skip_all)]
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
        send_message_timeout(&bot, msg.chat.id, text, Some(crate::generation_utils::back_cancel_keyboard(lang).into())).await?;
        state.step = 1;
        dialogue_update_timeout(&dialogue, Scene::VoiceAvatar(state)).await?;
        return Ok(());
    }

    if state.step == 1 {
        let (file_id, size) = if let Some(voice) = msg.voice() {
            (Some(voice.file.id.clone()), voice.file.size as u64)
        } else if let Some(audio) = msg.audio() {
            (Some(audio.file.id.clone()), audio.file.size as u64)
        } else {
            (None, 0)
        };

        if let Some(fid) = file_id {
            if size > MAX_VOICE_AVATAR_AUDIO_BYTES {
                let err = if lang.is_russian() {
                    "❌ Файл слишком большой. Максимум 50 МБ."
                } else {
                    "❌ File too large. Maximum 50 MB."
                };
                send_message_timeout(&bot, msg.chat.id, err, None).await?;
                return Ok(());
            }
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
            send_message_timeout(&bot, msg.chat.id, text, None).await?;
        }
    }

    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_voice_avatar_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    _state: VoiceAvatarState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    answer_callback_query_timeout(&bot, &q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    if data == "va:cancel" {
        let chat_id = match q.chat_id() {
            Some(id) => id,
            None => return Ok(()),
        };
        return return_to_menu(&bot, &dialogue, chat_id, lang).await;
    }
    Ok(())
}
