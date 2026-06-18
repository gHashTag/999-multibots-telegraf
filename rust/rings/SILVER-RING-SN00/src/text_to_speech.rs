use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, TextToSpeechState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::{answer_callback_query_timeout, send_message_timeout, dialogue_update_timeout};
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, deduct_balance, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const TTS_COST: f64 = 3.0;
const MAX_DIALOGUE_TEXT_LEN: usize = 2000;

#[tracing::instrument(skip_all)]
pub async fn handle_text_to_speech_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: TextToSpeechState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let tid = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
    if tid == 0 {
        tracing::warn!("Missing telegram_id; aborting handler");
        return Ok(());
    }

    if state.step == 0 {
        let text = if lang.is_russian() {
            "🎙️ Отправьте текст для преобразования в голос"
        } else {
            "🎙️ Send text to convert to voice"
        };
        send_message_timeout(&bot, msg.chat.id, text, Some(crate::generation_utils::back_cancel_keyboard(lang).into())).await?;
        state.step = 1;
        dialogue_update_timeout(&dialogue, Scene::TextToSpeech(state)).await?;
        return Ok(());
    }

    if state.step == 1 {
        if let Some(text) = msg.text() {
            if text.trim().is_empty() {
                let err = if lang.is_russian() { "✍️ Пожалуйста, отправьте текст" } else { "✍️ Please send text" };
                send_message_timeout(&bot, msg.chat.id, err, None).await?;
                return Ok(());
            }

            if text.len() > MAX_DIALOGUE_TEXT_LEN {
                let err = if lang.is_russian() { "❌ Текст слишком длинный. Максимум 2000 символов." } else { "❌ Text too long. Maximum 2000 characters." };
                send_message_timeout(&bot, msg.chat.id, err, None).await?;
                return Ok(());
            }

            if let Err(err_msg) = deduct_balance(&db, tid, TTS_COST, lang).await {
                send_message_timeout(&bot, msg.chat.id, err_msg, None).await?;
                return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
            }
            state.text = Some(text.to_string());
            state.model = Some("elevenlabs".to_string());

            return dispatch_and_reply(
                &bot, &dialogue, msg.chat.id,
                &job_queue, &db,
                DispatchParams {
                    telegram_id: tid,
                    lang,
                    media_type: MediaType::TextToSpeech,
                    job_type: "voice_cloning",
                    cost: 10.0,
                    prompt: state.text.clone(),
                    image_url: None,
                    model: state.model.clone(),
                },
            ).await;
        } else {
            let err = if lang.is_russian() { "✍️ Пожалуйста, отправьте текст" } else { "✍️ Please send text" };
            send_message_timeout(&bot, msg.chat.id, err, None).await?;
        }
    }

    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_text_to_speech_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    _state: TextToSpeechState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    answer_callback_query_timeout(&bot, &q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    if data == "tts:cancel" {
        let chat_id = match q.chat_id() {
            Some(id) => id,
            None => return Ok(()),
        };
        return return_to_menu(&bot, &dialogue, chat_id, lang).await;
    }
    Ok(())
}
