use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, DigitalAvatarBodyState};
use trios_mb_tg::HandlerResult;
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_digital_avatar_body_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: DigitalAvatarBodyState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    match state.step {
        0 => {
            let kb = InlineKeyboardMarkup::new(vec![
                vec![InlineKeyboardButton::callback(
                    if lang.is_russian() { "💼 Бизнес" } else { "💼 Business" },
                    "dab:business",
                )],
                vec![InlineKeyboardButton::callback(
                    if lang.is_russian() { "🎭 Креативный" } else { "🎭 Creative" },
                    "dab:creative",
                )],
                vec![InlineKeyboardButton::callback(
                    if lang.is_russian() { "🏋️ Спортивный" } else { "🏋️ Sporty" },
                    "dab:sporty",
                )],
                vec![InlineKeyboardButton::callback(
                    if lang.is_russian() { "❌ Отмена" } else { "❌ Cancel" },
                    "dab:cancel",
                )],
            ]);
            let text = if lang.is_russian() {
                "🤖 Цифровое тело\n\nВыберите стиль тела:"
            } else {
                "🤖 Digital Body\n\nChoose body style:"
            };
            bot.send_message(msg.chat.id, text).reply_markup(kb).await?;
            state.step = 1;
            dialogue.update(Scene::DigitalAvatarBody(state)).await?;
        }
        1 => {
            if let Some(photos) = msg.photo() {
                let file_id = photos.last().map(|p| p.file.id.clone()).unwrap_or_default();
                state.face_url = Some(file_id);
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
                        media_type: MediaType::Image,
                        job_type: "image_rendering",
                        cost: 10.0,
                        prompt: state.body_style.clone(),
                        image_url: state.face_url.clone(),
                        model: None,
                    },
                ).await;
            } else {
                let text = if lang.is_russian() { "Отправьте фото лица" } else { "Send a face photo" };
                bot.send_message(msg.chat.id, text).await?;
            }
        }
        _ => {}
    }
    Ok(())
}

pub async fn handle_digital_avatar_body_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: DigitalAvatarBodyState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let chat_id = q.chat_id().unwrap();
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    match data {
        "dab:cancel" => {
            return return_to_menu(&bot, &dialogue, chat_id, lang).await;
        }
        d if d.starts_with("dab:") => {
            let style = match d {
                "dab:business" => "business",
                "dab:creative" => "creative",
                "dab:sporty" => "sporty",
                _ => "business",
            };
            state.body_style = Some(style.to_string());
            state.step = 1;
            let text = if lang.is_russian() { "📸 Отправьте фото лица:" } else { "📸 Send a face photo:" };
            bot.send_message(chat_id, text).await?;
            dialogue.update(Scene::DigitalAvatarBody(state)).await?;
        }
        _ => {}
    }
    Ok(())
}
