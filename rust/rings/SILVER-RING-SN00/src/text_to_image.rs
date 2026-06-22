use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, TextToImageState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::keyboards::main_menu_keyboard;
use trios_mb_tg::{answer_callback_query_timeout, dialogue_update_timeout, send_message_timeout};
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, dispatch_and_reply, load_lang, load_lang_cb, return_to_menu};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

#[tracing::instrument(skip_all)]
pub async fn handle_text_to_image_entry(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let text = if lang.is_russian() { "Введите описание изображения:" } else { "Enter image description:" };
    send_message_timeout(
        &bot, msg.chat.id, text, None,
    ).await?;
    let mut state = TextToImageState::default();
    state.step = 1;
    dialogue_update_timeout(&dialogue, Scene::TextToImage(state)).await?;
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_text_to_image_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: TextToImageState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let text = match msg.text() {
        Some(t) => t,
        None => return Ok(()),
    };

    if text.trim().is_empty() {
        let err = if lang.is_russian() { "❌ Пустой промпт не допускается." } else { "❌ Empty prompt is not allowed." };
        send_message_timeout(
            &bot, msg.chat.id, err, None,
        ).await?;
        return Ok(());
    }

    if text.len() > 4000 {
        let err = if lang.is_russian() { "❌ Текст слишком длинный. Максимум 4000 символов." } else { "❌ Text too long. Maximum 4000 characters." };
        send_message_timeout(
            &bot, msg.chat.id, err, None,
        ).await?;
        return Ok(());
    }

    match state.step {
        1 => {
            state.prompt = Some(text.to_string());
            state.step = 2;

            let kb = InlineKeyboardMarkup::new(vec![
                vec![
                    InlineKeyboardButton::callback("FLUX 1.1 Pro", "ti:flux_pro"),
                    InlineKeyboardButton::callback("SDXL", "ti:sdxl"),
                ],
                vec![
                    InlineKeyboardButton::callback("DALL-E 3", "ti:dalle3"),
                    InlineKeyboardButton::callback("Midjourney", "ti:midjourney"),
                ],
            ]);

            let model_text = if lang.is_russian() { "Выберите модель:" } else { "Select model:" };
            send_message_timeout(
                &bot, msg.chat.id, model_text, Some(kb.into()),
            ).await?;
            dialogue_update_timeout(
                &dialogue, Scene::TextToImage(state)).await?;
        }
        3 => {
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

#[tracing::instrument(skip_all)]
pub async fn handle_text_to_image_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: TextToImageState,
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
        tracing::warn!("Callback query missing valid telegram_id; aborting text_to_image handler");
        return Ok(());
    }

    let data = match &q.data {
        Some(d) => d.as_str(),
        None => return Ok(()),
    };

    match data {
        "ti:flux_pro" | "ti:sdxl" | "ti:dalle3" | "ti:midjourney" => {
            let model = match data {
                "ti:flux_pro" => "flux-1.1-pro",
                "ti:sdxl" => "sdxl",
                "ti:dalle3" => "dall-e-3",
                "ti:midjourney" => "midjourney",
                _ => "flux-1.1-pro",
            };
            state.model = Some(model.to_string());
            state.step = 3;

            let kb = InlineKeyboardMarkup::new(vec![
                vec![
                    InlineKeyboardButton::callback("1:1", "ti:ratio_1_1"),
                    InlineKeyboardButton::callback("16:9", "ti:ratio_16_9"),
                    InlineKeyboardButton::callback("9:16", "ti:ratio_9_16"),
                ],
            ]);

            let ratio_text = if lang.is_russian() { "Выберите пропорции:" } else { "Select aspect ratio:" };
            send_message_timeout(
                &bot, chat_id, ratio_text, Some(kb.into()),
            ).await?;
            dialogue_update_timeout(
                &dialogue, Scene::TextToImage(state)).await?;
        }
        "ti:ratio_1_1" | "ti:ratio_16_9" | "ti:ratio_9_16" => {
            let ratio = match data {
                "ti:ratio_1_1" => "1:1",
                "ti:ratio_16_9" => "16:9",
                "ti:ratio_9_16" => "9:16",
                _ => "1:1",
            };
            state.aspect_ratio = Some(ratio.to_string());
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
                    media_type: MediaType::Image,
                    job_type: "image_rendering",
                    cost: 10.0,
                    prompt: Some(prompt),
                    image_url: None,
                    model: state.model.clone(),
                },
            ).await;
        }
        "ti:retry" => {
            let text = if lang.is_russian() { "Введите описание изображения:" } else { "Enter image description:" };
            send_message_timeout(
                &bot, chat_id, text, None,
            ).await?;
            dialogue_update_timeout(&dialogue, Scene::TextToImage(TextToImageState::default())).await?;
        }
        "ti:done" => {
            dialogue_update_timeout(&dialogue, Scene::MainMenu).await?;
            send_message_timeout(
                &bot, chat_id, trios_mb_i18n::t(lang, "main_menu"), Some(main_menu_keyboard(lang).into()),
            ).await?;
        }
        _ => {}
    }
    Ok(())
}
