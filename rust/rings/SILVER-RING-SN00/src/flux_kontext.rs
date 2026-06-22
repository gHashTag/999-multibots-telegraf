use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, FluxKontextState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::{answer_callback_query_timeout, dialogue_update_timeout, send_message_timeout};
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const MAX_DIALOGUE_TEXT_LEN: usize = 2000;

#[tracing::instrument(skip_all)]
pub async fn handle_flux_kontext_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: FluxKontextState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    match state.step {
        0 => {
            let kb = InlineKeyboardMarkup::new(vec![
                vec![InlineKeyboardButton::callback(
                    if lang.is_russian() { "🎨 Контекстное редактирование" } else { "🎨 Context Edit" },
                    "fk:edit",
                )],
                vec![InlineKeyboardButton::callback(
                    if lang.is_russian() { "🔀 Смешивание изображений" } else { "🔀 Image Blend" },
                    "fk:blend",
                )],
                vec![InlineKeyboardButton::callback(
                    if lang.is_russian() { "❌ Отмена" } else { "❌ Cancel" },
                    "fk:cancel",
                )],
            ]);
            let text = if lang.is_russian() {
                "🎨 FLUX Kontext\n\nВыберите режим:"
            } else {
                "🎨 FLUX Kontext\n\nSelect mode:"
            };
            send_message_timeout(
                &bot, msg.chat.id, text, Some(kb.into()),
            ).await?;
            state.step = 1;
            dialogue_update_timeout(&dialogue, Scene::FluxKontext(state)).await?;
        }
        2 => {
            if let Some(photos) = msg.photo() {
                let file_id = match photos.last() {
                    Some(p) => p.file.id.clone(),
                    None => {
                        let err = if lang.is_russian() { "❌ Не удалось получить изображение." } else { "❌ Could not retrieve image." };
                        send_message_timeout(&bot, msg.chat.id, err, None).await?;
                        return Ok(());
                    }
                };
                if state.mode.as_deref() == Some("blend") {
                    if state.image_a.is_none() {
                        state.image_a = Some(file_id);
                        let text = if lang.is_russian() {
                            "✅ Первое изображение получено!\n\nОтправьте второе изображение:"
                        } else {
                            "✅ First image received!\n\nSend the second image:"
                        };
                        send_message_timeout(&bot, msg.chat.id, text, None).await?;
                    } else {
                        state.image_b = Some(file_id);
                        state.step = 3;
                        let text = if lang.is_russian() {
                            "✅ Второе изображение получено!\n\nОпишите желаемый результат:"
                        } else {
                            "✅ Second image received!\n\nDescribe the desired result:"
                        };
                        send_message_timeout(&bot, msg.chat.id, text, None).await?;
                    }
                } else {
                    state.image_a = Some(file_id);
                    state.step = 3;
                    let text = if lang.is_russian() {
                        "✅ Изображение получено!\n\nОпишите, что нужно изменить:"
                    } else {
                        "✅ Image received!\n\nDescribe what to change:"
                    };
                    send_message_timeout(&bot, msg.chat.id, text, None).await?;
                }
                dialogue_update_timeout(&dialogue, Scene::FluxKontext(state)).await?;
            } else {
                let text = if lang.is_russian() { "Отправьте изображение" } else { "Send an image" };
                send_message_timeout(&bot, msg.chat.id, text, None).await?;
            }
        }
        3 => {
            if let Some(text) = msg.text() {
                if text.trim().is_empty() {
                    let err = if lang.is_russian() { "❌ Пустой текст недопустим." } else { "❌ Empty text is not allowed." };
                    send_message_timeout(&bot, msg.chat.id, err, None).await?;
                    return Ok(());
                }
                if text.len() > MAX_DIALOGUE_TEXT_LEN {
                    let err = if lang.is_russian() { "❌ Текст слишком длинный. Максимум 2000 символов." } else { "❌ Text too long. Maximum 2000 characters." };
                    send_message_timeout(&bot, msg.chat.id, err, None).await?;
                    return Ok(());
                }
                state.prompt = Some(text.to_string());
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
                        image_url: state.image_a.clone(),
                        model: None,
                    },
                ).await;
            }
        }
        _ => {}
    }
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_flux_kontext_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: FluxKontextState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    answer_callback_query_timeout(&bot, &q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let chat_id = match q.chat_id() {
        Some(id) => id,
        None => return Ok(()),
    };
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    match data {
        "fk:cancel" => {
            return return_to_menu(&bot, &dialogue, chat_id, lang).await;
        }
        "fk:edit" | "fk:blend" => {
            state.mode = Some(if data == "fk:edit" { "edit" } else { "blend" }.to_string());
            state.step = 2;
            let text = if lang.is_russian() { "🖼️ Отправьте изображение:" } else { "🖼️ Send an image:" };
            send_message_timeout(&bot, chat_id, text, None).await?;
            dialogue_update_timeout(&dialogue, Scene::FluxKontext(state)).await?;
        }
        _ => {}
    }
    Ok(())
}
