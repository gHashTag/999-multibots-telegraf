use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, AvatarTransformState};
use trios_mb_tg::HandlerResult;
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, deduct_balance, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const AVATAR_TRANSFORM_COST: f64 = 5.0;
const MAX_DIALOGUE_TEXT_LEN: usize = 2000;

#[tracing::instrument(skip_all)]
pub async fn handle_avatar_transform_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: AvatarTransformState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    match state.step {
        0 => {
            let kb = InlineKeyboardMarkup::new(vec![
                vec![
                    InlineKeyboardButton::callback("🦸‍♂️ Spider-Man", "at:spider"),
                    InlineKeyboardButton::callback("🦸‍♂️ Iron Man", "at:iron"),
                ],
                vec![
                    InlineKeyboardButton::callback("🦇 Batman", "at:batman"),
                    InlineKeyboardButton::callback("🦸‍♂️ Superman", "at:superman"),
                ],
                vec![
                    InlineKeyboardButton::callback("⚡ Thor", "at:thor"),
                    InlineKeyboardButton::callback("💀 Deadpool", "at:deadpool"),
                ],
                vec![
                    InlineKeyboardButton::callback(
                        if lang.is_russian() { "✍️ Свой промпт" } else { "✍️ Custom prompt" },
                        "at:custom",
                    ),
                ],
                vec![InlineKeyboardButton::callback(
                    if lang.is_russian() { "❌ Отмена" } else { "❌ Cancel" },
                    "at:cancel",
                )],
            ]);
            let text = if lang.is_russian() {
                "🦸 ИИ Герои\n\nВыберите супергероя:"
            } else {
                "🦸 AI Heroes\n\nChoose a superhero:"
            };
            bot.send_message(msg.chat.id, text).reply_markup(kb).await?;
            state.step = 1;
            dialogue.update(Scene::AvatarTransform(state)).await?;
        }
        1 => {
            if let Some(text) = msg.text() {
                if text.len() > MAX_DIALOGUE_TEXT_LEN {
                    let err = if lang.is_russian() { "❌ Текст слишком длинный. Максимум 2000 символов." } else { "❌ Text too long. Maximum 2000 characters." };
                    bot.send_message(msg.chat.id, err).await?;
                    return Ok(());
                }
                state.style = Some(text.to_string());
                state.step = 2;
                let prompt_text = if lang.is_russian() { "Отправьте своё фото:" } else { "Send your photo:" };
                bot.send_message(msg.chat.id, prompt_text).await?;
                dialogue.update(Scene::AvatarTransform(state)).await?;
            }
        }
        2 => {
            if let Some(photos) = msg.photo() {
                let file_id = match photos.last() {
                    Some(p) => p.file.id.clone(),
                    None => {
                        let err = if lang.is_russian() { "❌ Не удалось получить изображение." } else { "❌ Could not retrieve image." };
                        bot.send_message(msg.chat.id, err).await?;
                        return Ok(());
                    }
                };
                let tid = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
    if tid == 0 {
        tracing::warn!("Missing telegram_id; aborting handler");
        return Ok(());
    }

                if let Err(err_msg) = deduct_balance(&db, tid, AVATAR_TRANSFORM_COST, lang).await {
                    bot.send_message(msg.chat.id, err_msg).await?;
                    return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                }
                state.image_url = Some(file_id);
                return dispatch_and_reply(
                    &bot, &dialogue, msg.chat.id,
                    &job_queue, &db,
                    DispatchParams {
                        telegram_id: tid,
                        lang,
                        media_type: MediaType::Image,
                        job_type: "image_rendering",
                        cost: 10.0,
                        prompt: state.style.clone(),
                        image_url: state.image_url.clone(),
                        model: None,
                    },
                ).await;
            } else {
                let text = if lang.is_russian() { "Отправьте фото" } else { "Send a photo" };
                bot.send_message(msg.chat.id, text).await?;
            }
        }
        _ => {}
    }
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_avatar_transform_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: AvatarTransformState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let tid = q.from.id.0 as i64;
    if tid <= 0 {
        tracing::warn!("Callback query missing valid telegram_id; aborting handler");
        return Ok(());
    }

    let lang = load_lang_cb(&db, &q).await;
    let chat_id = match q.chat_id() {
        Some(id) => id,
        None => return Ok(()),
    };
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    match data {
        "at:cancel" => {
            return return_to_menu(&bot, &dialogue, chat_id, lang).await;
        }
        "at:custom" => {
            state.style = Some("custom".to_string());
            state.step = 1;
            let text = if lang.is_russian() { "✍️ Опишите желаемый стиль:" } else { "✍️ Describe the desired style:" };
            bot.send_message(chat_id, text).await?;
            dialogue.update(Scene::AvatarTransform(state)).await?;
        }
        d if d.starts_with("at:") => {
            let hero = match d {
                "at:spider" => "Spider-Man",
                "at:iron" => "Iron Man",
                "at:batman" => "Batman",
                "at:superman" => "Superman",
                "at:thor" => "Thor",
                "at:deadpool" => "Deadpool",
                _ => "Superhero",
            };
            state.style = Some(hero.to_string());
            state.step = 2;
            let text = if lang.is_russian() { "📸 Отправьте своё фото:" } else { "📸 Send your photo:" };
            bot.send_message(chat_id, text).await?;
            dialogue.update(Scene::AvatarTransform(state)).await?;
        }
        _ => {}
    }
    Ok(())
}
