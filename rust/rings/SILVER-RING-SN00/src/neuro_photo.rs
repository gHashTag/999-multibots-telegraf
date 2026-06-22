use std::sync::Arc;
use teloxide::dispatching::dialogue::GetChatId;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, NeuroPhotoState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::keyboards::main_menu_keyboard;
use trios_mb_tg::{answer_callback_query_timeout, dialogue_update_timeout, send_message_timeout};
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, dispatch_and_reply, load_lang, load_lang_cb, return_to_menu};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const MAX_DIALOGUE_TEXT_LEN: usize = 2000;

#[tracing::instrument(skip_all)]
pub async fn handle_neuro_photo_entry(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    send_message_timeout(
        &bot, msg.chat.id, trios_mb_i18n::t(lang, "send_photo"), None,
    ).await?;
    let mut state = NeuroPhotoState::default();
    state.step = 1;
    dialogue_update_timeout(&dialogue, Scene::NeuroPhoto(state)).await?;
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_neuro_photo_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    state: NeuroPhotoState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    if let Some(photos) = msg.photo() {
        if state.step <= 1 {
            let file_id = match photos.last() {
                Some(p) => p.file.id.clone(),
                None => {
                    let err = if lang.is_russian() { "❌ Не удалось получить изображение." } else { "❌ Could not retrieve image." };
                    send_message_timeout(
                        &bot, msg.chat.id, err, None,
                    ).await?;
                    return Ok(());
                }
            };
            let mut new_state = state;
            new_state.image_url = Some(file_id);
            new_state.step = 2;
            send_message_timeout(
                &bot, msg.chat.id, trios_mb_i18n::t(lang, "send_text"), None,
            ).await?;
            dialogue_update_timeout(&dialogue, Scene::NeuroPhoto(new_state)).await?;
            return Ok(());
        }
    }

    if let Some(text) = msg.text() {
        if state.step == 2 && state.image_url.is_some() {
            if text.trim().is_empty() {
                let err = if lang.is_russian() { "❌ Пустой промпт не допускается." } else { "❌ Empty prompt is not allowed." };
                send_message_timeout(
                    &bot, msg.chat.id, err, None,
                ).await?;
                return Ok(());
            }
            if text.len() > MAX_DIALOGUE_TEXT_LEN {
                let err = if lang.is_russian() { "❌ Текст слишком длинный. Максимум 2000 символов." } else { "❌ Text too long. Maximum 2000 characters." };
                send_message_timeout(
                    &bot, msg.chat.id, err, None,
                ).await?;
                return Ok(());
            }
            let mut new_state = state;
            new_state.prompt = Some(text.to_string());
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
                    prompt: new_state.prompt.clone(),
                    image_url: new_state.image_url.clone(),
                    model: new_state.model.clone(),
                },
            ).await;
        }
    }

    if state.step == 0 {
        send_message_timeout(
            &bot, msg.chat.id, trios_mb_i18n::t(lang, "send_photo"), None,
        ).await?;
        let mut new_state = state;
        new_state.step = 1;
        dialogue_update_timeout(&dialogue, Scene::NeuroPhoto(new_state)).await?;
    }
    Ok(())
}

#[tracing::instrument(skip_all)]
#[tracing::instrument(skip_all)]
pub async fn handle_neuro_photo_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    state: NeuroPhotoState,
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
        tracing::warn!("Callback query missing valid telegram_id; aborting neuro_photo handler");
        return Ok(());
    }

    let data = match &q.data {
        Some(d) => d.as_str(),
        None => return Ok(()),
    };

    match data {
        "np:male" | "np:female" => {
            let gender = if data == "np:male" { "male" } else { "female" };
            let mut new_state = state;
            new_state.gender = Some(gender.to_string());
            let prompt = match new_state.prompt.as_ref() {
                Some(p) => p.clone(),
                None => {
                    let err = if lang.is_russian() { "❌ Сессия устарела. Начните заново." } else { "❌ Session expired. Please start again." };
                    send_message_timeout(
                        &bot, chat_id, err, None,
                    ).await?;
                    return return_to_menu(&bot, &dialogue, chat_id, lang).await;
                }
            };
            let image_url = match new_state.image_url.as_ref() {
                Some(u) => u.clone(),
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
                    image_url: Some(image_url),
                    model: new_state.model.clone(),
                },
            ).await;
        }
        "np:retry" => {
            send_message_timeout(
                &bot, chat_id, trios_mb_i18n::t(lang, "send_photo"), None,
            ).await?;
            dialogue_update_timeout(&dialogue, Scene::NeuroPhoto(NeuroPhotoState::default())).await?;
        }
        "np:done" => {
            dialogue_update_timeout(&dialogue, Scene::MainMenu).await?;
            send_message_timeout(
                &bot, chat_id, trios_mb_i18n::t(lang, "main_menu"), Some(main_menu_keyboard(lang).into()),
            ).await?;
        }
        _ => {}
    }
    Ok(())
}
