use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, LipSyncState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::keyboards::main_menu_keyboard;
use trios_mb_tg::{answer_callback_query_timeout, dialogue_update_timeout};
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, dispatch_and_reply, load_lang, load_lang_cb};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

#[tracing::instrument(skip_all)]
pub async fn handle_lip_sync_entry(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let text = if lang.is_russian() { "Отправьте видео для LipSync" } else { "Send a video for LipSync" };
    bot.send_message(msg.chat.id, text).await?;
    let mut state = LipSyncState::default();
    state.step = 1;
    dialogue_update_timeout(&dialogue, Scene::LipSync(state)).await?;
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_lip_sync_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: LipSyncState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    if let Some(video) = msg.video() {
        if state.step <= 1 {
            state.video_url = Some(video.file.id.clone());
            state.step = 2;
            let text = if lang.is_russian() { "Отправьте аудио" } else { "Send audio" };
            bot.send_message(msg.chat.id, text).await?;
            dialogue_update_timeout(&dialogue, Scene::LipSync(state)).await?;
            return Ok(());
        }
    }

    if let Some(audio) = msg.audio() {
        if state.step == 2 {
            state.audio_url = Some(audio.file.id.clone());
            state.step = 3;

            let kb = InlineKeyboardMarkup::new(vec![
                vec![
                    InlineKeyboardButton::callback("SyncLabs", "ls:synclabs"),
                    InlineKeyboardButton::callback("HeyGen", "ls:heygen"),
                ],
                vec![
                    InlineKeyboardButton::callback("Hedra", "ls:hedra"),
                    InlineKeyboardButton::callback("Fal", "ls:fal"),
                ],
            ]);

            let text = if lang.is_russian() { "Выберите модель:" } else { "Select model:" };
            bot.send_message(msg.chat.id, text).reply_markup(kb).await?;
            dialogue_update_timeout(&dialogue, Scene::LipSync(state)).await?;
            return Ok(());
        }
    }

    if let Some(voice) = msg.voice() {
        if state.step == 2 {
            state.audio_url = Some(voice.file.id.clone());
            state.step = 3;

            let kb = InlineKeyboardMarkup::new(vec![
                vec![
                    InlineKeyboardButton::callback("SyncLabs", "ls:synclabs"),
                    InlineKeyboardButton::callback("HeyGen", "ls:heygen"),
                ],
                vec![
                    InlineKeyboardButton::callback("Hedra", "ls:hedra"),
                    InlineKeyboardButton::callback("Fal", "ls:fal"),
                ],
            ]);

            let text = if lang.is_russian() { "Выберите модель:" } else { "Select model:" };
            bot.send_message(msg.chat.id, text).reply_markup(kb).await?;
            dialogue_update_timeout(&dialogue, Scene::LipSync(state)).await?;
            return Ok(());
        }
    }

    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_lip_sync_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: LipSyncState,
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
        tracing::warn!("Callback query missing valid telegram_id; aborting lip_sync handler");
        return Ok(());
    }

    let data = match &q.data {
        Some(d) => d.as_str(),
        None => return Ok(()),
    };

    match data {
        "ls:synclabs" | "ls:heygen" | "ls:hedra" | "ls:fal" => {
            let model = match data {
                "ls:synclabs" => "synclabs",
                "ls:heygen" => "heygen",
                "ls:hedra" => "hedra",
                "ls:fal" => "fal",
                _ => "synclabs",
            };
            state.model = Some(model.to_string());
            return dispatch_and_reply(
                &bot, &dialogue, chat_id,
                &job_queue, &db,
                DispatchParams {
                    telegram_id: tid,
                    lang,
                    media_type: MediaType::LipSync,
                    job_type: "lipsync_rendering",
                    cost: 10.0,
                    prompt: state.video_url.clone(),
                    image_url: state.audio_url.clone(),
                    model: state.model.clone(),
                },
            ).await;
        }
        "ls:retry" => {
            let text = if lang.is_russian() { "Отправьте видео для LipSync" } else { "Send a video for LipSync" };
            bot.send_message(chat_id, text).await?;
            dialogue_update_timeout(&dialogue, Scene::LipSync(LipSyncState::default())).await?;
        }
        "ls:done" => {
            dialogue_update_timeout(&dialogue, Scene::MainMenu).await?;
            bot.send_message(chat_id, trios_mb_i18n::t(lang, "main_menu"))
                .reply_markup(main_menu_keyboard(lang))
                .await?;
        }
        _ => {}
    }
    Ok(())
}
