use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, VideoTranscriptionState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::answer_callback_query_timeout;
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

#[tracing::instrument(skip_all)]
pub async fn handle_video_transcription_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: VideoTranscriptionState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    if state.step == 0 {
        let text = if lang.is_russian() {
            "📺 Отправьте видео для транскрибации"
        } else {
            "📺 Send a video for transcription"
        };
        bot.send_message(msg.chat.id, text)
            .reply_markup(crate::generation_utils::back_cancel_keyboard(lang))
            .await?;
        state.step = 1;
        dialogue.update(Scene::VideoTranscription(state)).await?;
        return Ok(());
    }

    if state.step == 1 {
        if let Some(video) = msg.video() {
            state.video_url = Some(video.file.id.clone());
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
                    media_type: MediaType::Video,
                    job_type: "video_rendering",
                    cost: 10.0,
                    prompt: None,
                    image_url: state.video_url.clone(),
                    model: None,
                },
            ).await;
        } else {
            let text = if lang.is_russian() { "Отправьте видео" } else { "Send a video" };
            bot.send_message(msg.chat.id, text).await?;
        }
    }

    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_video_transcription_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    _state: VideoTranscriptionState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    answer_callback_query_timeout(&bot, &q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    if data == "vt:cancel" {
        let chat_id = match q.chat_id() {
            Some(id) => id,
            None => return Ok(()),
        };
        return return_to_menu(&bot, &dialogue, chat_id, lang).await;
    }
    Ok(())
}
