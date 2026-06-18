use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, TextToVideoState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::keyboards::main_menu_keyboard;
use trios_mb_tg::{answer_callback_query_timeout, dialogue_update_timeout, send_message_timeout};
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, dispatch_and_reply, load_lang, load_lang_cb, return_to_menu};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

#[tracing::instrument(skip_all)]
pub async fn handle_text_to_video_entry(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let text = if lang.is_russian() { "Введите описание видео:" } else { "Enter video description:" };
    send_message_timeout(
        &bot, msg.chat.id, text, None,
    ).await?;
    let mut state = TextToVideoState::default();
    state.step = 1;
    dialogue_update_timeout(
        &dialogue, Scene::TextToVideo(state)).await?;
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_text_to_video_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: TextToVideoState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let text = match msg.text() {
        Some(t) => t,
        None => return Ok(()),
    };

    if text.len() > 4000 {
        let err = if lang.is_russian() { "❌ Текст слишком длинный. Максимум 4000 символов." } else { "❌ Text too long. Maximum 4000 characters." };
        send_message_timeout(
            &bot, msg.chat.id, err, None,
        ).await?;
        return Ok(());
    }

    if state.step == 1 {
        state.prompt = Some(text.to_string());
        state.step = 2;

        let kb = InlineKeyboardMarkup::new(vec![
            vec![
                InlineKeyboardButton::callback("Kling 1.6", "tv:kling"),
                InlineKeyboardButton::callback("Runway Gen-3", "tv:runway"),
            ],
            vec![
                InlineKeyboardButton::callback("Sora", "tv:sora"),
                InlineKeyboardButton::callback("Luma Dream Machine", "tv:luma"),
            ],
        ]);

        let model_text = if lang.is_russian() { "Выберите модель:" } else { "Select model:" };
        send_message_timeout(
            &bot, msg.chat.id, model_text, Some(kb.into()),
        ).await?;
        dialogue_update_timeout(
            &dialogue, Scene::TextToVideo(state)).await?;
    }
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_text_to_video_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: TextToVideoState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    answer_callback_query_timeout(&bot, &q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let chat_id = match q.chat_id() {
        Some(id) => id,
        None => return Ok(()),
    };
    let tid = q.from.id.0 as i64;
    if tid <= 0 {
        tracing::warn!("Callback query missing valid telegram_id; aborting text_to_video handler");
        return Ok(());
    }

    let data = match &q.data {
        Some(d) => d.as_str(),
        None => return Ok(()),
    };

    match data {
        "tv:kling" | "tv:runway" | "tv:sora" | "tv:luma" => {
            let model = match data {
                "tv:kling" => "kling-1.6",
                "tv:runway" => "runway-gen3",
                "tv:sora" => "sora",
                "tv:luma" => "luma-dream-machine",
                _ => "kling-1.6",
            };
            state.model = Some(model.to_string());
            state.step = 3;

            let kb = InlineKeyboardMarkup::new(vec![
                vec![
                    InlineKeyboardButton::callback("5s", "tv:dur_5"),
                    InlineKeyboardButton::callback("10s", "tv:dur_10"),
                ],
            ]);

            let dur_text = if lang.is_russian() { "Выберите длительность:" } else { "Select duration:" };
            send_message_timeout(
                &bot, chat_id, dur_text, Some(kb.into()),
            ).await?;
            dialogue_update_timeout(
                &dialogue, Scene::TextToVideo(state)).await?;
        }
        "tv:dur_5" | "tv:dur_10" => {
            let dur = match data {
                "tv:dur_5" => 5,
                "tv:dur_10" => 10,
                _ => 5,
            };
            state.duration = Some(dur);
            let prompt = match state.prompt.as_ref() {
                Some(p) => p.clone(),
                None => {
                    let err = if lang.is_russian() { "❌ Сессия устарела. Начните заново." } else { "❌ Session expired. Please start again." };
                    send_message_timeout(
                        &bot, chat_id, err, None,
                    ).await?;
                    return return_to_menu(&bot, &dialogue, chat_id, lang).await;
                }
            };
            return dispatch_and_reply(
                &bot, &dialogue, chat_id,
                &job_queue, &db,
                DispatchParams {
                    telegram_id: tid,
                    lang,
                    media_type: MediaType::Video,
                    job_type: "video_rendering",
                    cost: 10.0,
                    prompt: Some(prompt),
                    image_url: None,
                    model: state.model.clone(),
                },
            ).await;
        }
        "tv:retry" => {
            let text = if lang.is_russian() { "Введите описание видео:" } else { "Enter video description:" };
            send_message_timeout(
                &bot, chat_id, text, None,
            ).await?;
            dialogue_update_timeout(
                &dialogue, Scene::TextToVideo(TextToVideoState::default())).await?;
        }
        "tv:done" => {
            dialogue_update_timeout(
                &dialogue, Scene::MainMenu).await?;
            send_message_timeout(
                &bot, chat_id, trios_mb_i18n::t(lang, "main_menu"), Some(main_menu_keyboard(lang).into()),
            ).await?;
        }
        _ => {}
    }
    Ok(())
}
