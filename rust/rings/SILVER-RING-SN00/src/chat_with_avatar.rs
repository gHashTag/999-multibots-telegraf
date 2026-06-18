use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, ChatWithAvatarState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::{answer_callback_query_timeout, send_message_timeout, dialogue_update_timeout};
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

#[tracing::instrument(skip_all)]
pub async fn handle_chat_with_avatar_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: ChatWithAvatarState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    if state.step == 0 {
        let text = if lang.is_russian() {
            "💭 Напишите сообщение для аватара:"
        } else {
            "💭 Write a message to the avatar:"
        };
        send_message_timeout(&bot, msg.chat.id, text, Some(crate::generation_utils::back_cancel_keyboard(lang).into())).await?;
        state.step = 1;
        dialogue_update_timeout(&dialogue, Scene::ChatWithAvatar(state)).await?;
        return Ok(());
    }

    if state.step == 1 {
        if let Some(text) = msg.text() {
            if text.len() > 4000 {
                let err = if lang.is_russian() { "❌ Текст слишком длинный. Максимум 4000 символов." } else { "❌ Text too long. Maximum 4000 characters." };
                send_message_timeout(&bot, msg.chat.id, err, None).await?;
                return Ok(());
            }
            state.message = Some(text.to_string());
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
                    prompt: state.message.clone(),
                    image_url: state.avatar_id.clone(),
                    model: None,
                },
            ).await;
        } else {
            let err = if lang.is_russian() { "Отправьте текстовое сообщение" } else { "Send a text message" };
            send_message_timeout(&bot, msg.chat.id, err, None).await?;
        }
    }

    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_chat_with_avatar_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    _state: ChatWithAvatarState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    answer_callback_query_timeout(&bot, &q.id).await?;
    let tid = q.from.id.0 as i64;
    if tid <= 0 {
        tracing::warn!("Callback query missing valid telegram_id; aborting handler");
        return Ok(());
    }

    let lang = load_lang_cb(&db, &q).await;
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    if data == "cwa:cancel" {
        let chat_id = match q.chat_id() {
            Some(id) => id,
            None => return Ok(()),
        };
        return return_to_menu(&bot, &dialogue, chat_id, lang).await;
    }
    Ok(())
}
