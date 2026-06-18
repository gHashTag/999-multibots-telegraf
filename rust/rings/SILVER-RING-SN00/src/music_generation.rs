use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, MusicGenerationState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::{answer_callback_query_timeout, dialogue_update_timeout, send_message_timeout};
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, deduct_balance, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const MUSIC_COST: f64 = 5.0;

#[tracing::instrument(skip_all)]
pub async fn handle_music_generation_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: MusicGenerationState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    match state.step {
        0 => {
            let text = if lang.is_russian() {
                "🎵 Опишите музыку, которую хотите сгенерировать:"
            } else {
                "🎵 Describe the music you want to generate:"
            };
            send_message_timeout(
                &bot, msg.chat.id, text,
                Some(crate::generation_utils::back_cancel_keyboard(lang).into()),
            ).await?;
            state.step = 1;
            dialogue_update_timeout(&dialogue, Scene::MusicGeneration(state)).await?;
        }
        1 => {
            if let Some(text) = msg.text() {
                if text.len() > 4000 {
                    let err = if lang.is_russian() { "❌ Текст слишком длинный. Максимум 4000 символов." } else { "❌ Text too long. Maximum 4000 characters." };
                    send_message_timeout(
                        &bot, msg.chat.id, err, None,
                    ).await?;
                    return Ok(());
                }
                state.prompt = Some(text.to_string());
                state.step = 2;

                let kb = InlineKeyboardMarkup::new(vec![
                    vec![
                        InlineKeyboardButton::callback("Suno v3.5", "mus:suno"),
                        InlineKeyboardButton::callback("Udio", "mus:udio"),
                    ],
                ]);
                let model_text = if lang.is_russian() { "Выберите модель:" } else { "Select model:" };
                send_message_timeout(
                    &bot, msg.chat.id, model_text, Some(kb.into()),
                ).await?;
                dialogue_update_timeout(
                    &dialogue, Scene::MusicGeneration(state)).await?;
            }
        }
        _ => {}
    }
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_music_generation_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: MusicGenerationState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    answer_callback_query_timeout(&bot, &q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let chat_id = match q.chat_id() {
        Some(id) => id,
        None => return Ok(()),
    };
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };
    let tid = q.from.id.0 as i64;
    if tid <= 0 {
        tracing::warn!("Callback query missing valid telegram_id; aborting music_generation handler");
        return Ok(());
    }

    match data {
        "mus:cancel" => {
            return return_to_menu(&bot, &dialogue, chat_id, lang).await;
        }
        "mus:suno" | "mus:udio" => {
            if state.prompt.is_none() || state.prompt.as_ref().map(|s| s.is_empty()).unwrap_or(true) {
                let text = "❌ Please describe the music first.";
                send_message_timeout(
                    &bot, chat_id, text, None,
                ).await?;
                return return_to_menu(&bot, &dialogue, chat_id, lang).await;
            }

            if let Err(err_msg) = deduct_balance(&db, tid, MUSIC_COST, lang).await {
                send_message_timeout(
                    &bot, chat_id, err_msg, None,
                ).await?;
                return return_to_menu(&bot, &dialogue, chat_id, lang).await;
            }
            state.model = Some(if data == "mus:suno" { "suno-v3.5" } else { "udio" }.to_string());
            return dispatch_and_reply(
                &bot, &dialogue, chat_id,
                &job_queue, &db,
                DispatchParams {
                    telegram_id: tid,
                    lang,
                    media_type: MediaType::Audio,
                    job_type: "image_rendering",
                    cost: 10.0,
                    prompt: state.prompt.clone(),
                    image_url: None,
                    model: state.model.clone(),
                },
            ).await;
        }
        _ => {}
    }
    Ok(())
}
