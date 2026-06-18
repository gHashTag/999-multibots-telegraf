use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, VideoDurationState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::answer_callback_query_timeout;
use crate::generation_utils::{load_lang, load_lang_cb};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

#[tracing::instrument(skip_all)]
pub async fn handle_video_duration_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: VideoDurationState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    let kb = InlineKeyboardMarkup::new(vec![
        vec![
            InlineKeyboardButton::callback("5s", "vd:5"),
            InlineKeyboardButton::callback("10s", "vd:10"),
        ],
        vec![
            InlineKeyboardButton::callback("15s", "vd:15"),
            InlineKeyboardButton::callback("30s", "vd:30"),
        ],
    ]);
    let text = if lang.is_russian() { "⏱️ Выберите длительность видео:" } else { "⏱️ Select video duration:" };
    bot.send_message(msg.chat.id, text).reply_markup(kb).await?;
    state.step = 1;
    dialogue.update(Scene::VideoDuration(state)).await?;
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_video_duration_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: VideoDurationState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    answer_callback_query_timeout(&bot, &q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let chat_id = match q.chat_id() {
        Some(id) => id,
        None => return Ok(()),
    };
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    let duration = match data {
        "vd:5" => 5,
        "vd:10" => 10,
        "vd:15" => 15,
        "vd:30" => 30,
        _ => return Ok(()),
    };

    state.duration = Some(duration);

    let text = if lang.is_russian() {
        format!("✅ Выбрана длительность: {} сек", duration)
    } else {
        format!("✅ Selected duration: {} sec", duration)
    };
    bot.send_message(chat_id, text).await?;
    dialogue.update(Scene::VideoDuration(state)).await?;
    Ok(())
}
