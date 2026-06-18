use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, AiReelsState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::answer_callback_query_timeout;
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, deduct_balance, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const AI_REELS_COST: f64 = 50.0;
const MAX_DIALOGUE_TEXT_LEN: usize = 2000;

#[tracing::instrument(skip_all)]
pub async fn handle_ai_reels_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: AiReelsState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    match state.step {
        0 => {
            let text = if lang.is_russian() {
                "🎬 AI Reels\n\nОпишите видео, которое хотите создать.\n\nСтоимость: 50 ⭐"
            } else {
                "🎬 AI Reels\n\nDescribe the video you want to create.\n\nCost: 50 ⭐"
            };
            bot.send_message(msg.chat.id, text)
                .reply_markup(crate::generation_utils::back_cancel_keyboard(lang))
                .await?;
            state.step = 1;
            dialogue.update(Scene::AiReels(state)).await?;
        }
        1 => {
            if let Some(text) = msg.text() {
                if text.trim().is_empty() {
                    let err = if lang.is_russian() { "✍️ Опишите видео" } else { "✍️ Describe the video" };
                    bot.send_message(msg.chat.id, err).await?;
                    return Ok(());
                }
                if text.len() > MAX_DIALOGUE_TEXT_LEN {
                    let err = if lang.is_russian() { "❌ Текст слишком длинный. Максимум 2000 символов." } else { "❌ Text too long. Maximum 2000 characters." };
                    bot.send_message(msg.chat.id, err).await?;
                    return Ok(());
                }
                state.prompt = Some(text.to_string());
                state.step = 2;

                let cinematic = if lang.is_russian() { "🎬 Кинематографичный" } else { "🎬 Cinematic" };
                let anime = if lang.is_russian() { "🌸 Аниме" } else { "🌸 Anime" };
                let realistic = if lang.is_russian() { "📷 Реалистичный" } else { "📷 Realistic" };

                let kb = InlineKeyboardMarkup::new(vec![
                    vec![InlineKeyboardButton::callback(cinematic, "reels:cinematic")],
                    vec![InlineKeyboardButton::callback(anime, "reels:anime")],
                    vec![InlineKeyboardButton::callback(realistic, "reels:realistic")],
                ]);
                let prompt_text = if lang.is_russian() { "🎨 Выберите стиль:" } else { "🎨 Select style:" };
                bot.send_message(msg.chat.id, prompt_text).reply_markup(kb).await?;
                dialogue.update(Scene::AiReels(state)).await?;
            } else {
                let text = if lang.is_russian() { "✍️ Опишите видео" } else { "✍️ Describe the video" };
                bot.send_message(msg.chat.id, text).await?;
            }
        }
        _ => {}
    }
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_ai_reels_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: AiReelsState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    answer_callback_query_timeout(&bot, &q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let chat_id = match q.chat_id() {
        Some(id) => id,
        None => return Ok(()),
    };
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    if data == "reels:cancel" {
        return return_to_menu(&bot, &dialogue, chat_id, lang).await;
    }

    let style = match data {
        "reels:cinematic" => "cinematic",
        "reels:anime" => "anime",
        "reels:realistic" => "realistic",
        _ => return Ok(()),
    };

    state.style = Some(style.to_string());
    let tid = q.from.id.0 as i64;
    if tid <= 0 {
        tracing::warn!("Callback query missing valid telegram_id; aborting ai_reels handler");
        return Ok(());
    }

    if state.prompt.is_none() || state.prompt.as_ref().map(|s| s.is_empty()).unwrap_or(true) {
        let text = "❌ Please describe the video first.";
        bot.send_message(chat_id, text).await?;
        return return_to_menu(&bot, &dialogue, chat_id, lang).await;
    }

    if let Err(err_msg) = deduct_balance(&db, tid, AI_REELS_COST, lang).await {
        bot.send_message(chat_id, err_msg).await?;
        return return_to_menu(&bot, &dialogue, chat_id, lang).await;
    }

    dispatch_and_reply(
        &bot, &dialogue, chat_id,
        &job_queue, &db,
        DispatchParams {
            telegram_id: tid,
            lang,
            media_type: MediaType::Video,
            job_type: "video_rendering",
            cost: 10.0,
            prompt: state.prompt.clone(),
            image_url: None,
            model: state.style.clone(),
        },
    ).await
}
