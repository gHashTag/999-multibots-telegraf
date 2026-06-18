use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, AvatarBrainState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::{answer_callback_query_timeout, dialogue_update_timeout, send_message_timeout};
use crate::generation_utils::{load_lang, load_lang_cb, return_to_menu};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const MAX_DIALOGUE_TEXT_LEN: usize = 2000;

#[tracing::instrument(skip_all)]
pub async fn handle_avatar_brain_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    mut state: AvatarBrainState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    match state.step {
        0 => {
            let text = if lang.is_russian() {
                "👋 Введите название вашей компании"
            } else {
                "👋 Enter your company name"
            };
            send_message_timeout(
                &bot, msg.chat.id, text,
                Some(crate::generation_utils::back_cancel_keyboard(lang).into()),
            ).await?;
            state.step = 1;
            dialogue_update_timeout(&dialogue, Scene::AvatarBrain(state)).await?;
        }
        1 => {
            if let Some(text) = msg.text() {
                if text.trim().is_empty() || text.trim().len() > 100 {
                    let err = if lang.is_russian() {
                        "❌ Название компании должно быть короче 100 символов"
                    } else {
                        "❌ Company name must be less than 100 characters"
                    };
                    send_message_timeout(&bot, msg.chat.id, err, None).await?;
                    return Ok(());
                }
                if text.len() > MAX_DIALOGUE_TEXT_LEN {
                    let err = if lang.is_russian() { "❌ Текст слишком длинный. Максимум 2000 символов." } else { "❌ Text too long. Maximum 2000 characters." };
                    send_message_timeout(&bot, msg.chat.id, err, None).await?;
                    return Ok(());
                }
                state.name = Some(text.trim().to_string());
                state.step = 2;
                let prompt = if lang.is_russian() { "💼 Укажите вашу должность" } else { "💼 Enter your position" };
                send_message_timeout(&bot, msg.chat.id, prompt, None).await?;
                dialogue_update_timeout(&dialogue, Scene::AvatarBrain(state)).await?;
            }
        }
        2 => {
            if let Some(text) = msg.text() {
                if text.trim().is_empty() || text.trim().len() > 100 {
                    let err = if lang.is_russian() {
                        "❌ Должность должна быть короче 100 символов"
                    } else {
                        "❌ Position must be less than 100 characters"
                    };
                    send_message_timeout(&bot, msg.chat.id, err, None).await?;
                    return Ok(());
                }
                if text.len() > MAX_DIALOGUE_TEXT_LEN {
                    let err = if lang.is_russian() { "❌ Текст слишком длинный. Максимум 2000 символов." } else { "❌ Text too long. Maximum 2000 characters." };
                    send_message_timeout(&bot, msg.chat.id, err, None).await?;
                    return Ok(());
                }
                state.personality = Some(text.trim().to_string());
                state.step = 3;
                let prompt = if lang.is_russian() {
                    "🛠️ Опишите ваши профессиональные навыки"
                } else {
                    "🛠️ Describe your professional skills"
                };
                send_message_timeout(&bot, msg.chat.id, prompt, None).await?;
                dialogue_update_timeout(&dialogue, Scene::AvatarBrain(state)).await?;
            }
        }
        3 => {
            if let Some(text) = msg.text() {
                if text.trim().is_empty() || text.trim().len() > 1000 {
                    let err = if lang.is_russian() {
                        "❌ Описание навыков слишком длинное"
                    } else {
                        "❌ Skills description too long"
                    };
                    send_message_timeout(&bot, msg.chat.id, err, None).await?;
                    return Ok(());
                }

                let company = match state.name.as_ref() {
                    Some(n) if !n.is_empty() => n.clone(),
                    _ => {
                        let err = if lang.is_russian() { "❌ Сессия устарела. Начните заново." } else { "❌ Session expired. Please start again." };
                        send_message_timeout(&bot, msg.chat.id, err, None).await?;
                        return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                    }
                };
                let position = match state.personality.as_ref() {
                    Some(p) if !p.is_empty() => p.clone(),
                    _ => {
                        let err = if lang.is_russian() { "❌ Сессия устарела. Начните заново." } else { "❌ Session expired. Please start again." };
                        send_message_timeout(&bot, msg.chat.id, err, None).await?;
                        return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                    }
                };
                if text.len() > MAX_DIALOGUE_TEXT_LEN {
                    let err = if lang.is_russian() { "❌ Текст слишком длинный. Максимум 2000 символов." } else { "❌ Text too long. Maximum 2000 characters." };
                    send_message_timeout(&bot, msg.chat.id, err, None).await?;
                    return Ok(());
                }
                let skills = text.trim().to_string();

                let text = if lang.is_russian() {
                    format!("✨ Мозг аватара успешно создан!\n\n📋 Сводка:\n• Компания: {}\n• Должность: {}\n• Навыки: {}", company, position, skills)
                } else {
                    format!("✨ Avatar's brain successfully created!\n\n📋 Summary:\n• Company: {}\n• Position: {}\n• Skills: {}", company, position, skills)
                };
                send_message_timeout(&bot, msg.chat.id, text, None).await?;
                return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
            }
        }
        _ => {}
    }
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_avatar_brain_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    _state: AvatarBrainState,
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

    if data == "ab:cancel" {
        let chat_id = match q.chat_id() {
            Some(id) => id,
            None => return Ok(()),
        };
        return return_to_menu(&bot, &dialogue, chat_id, lang).await;
    }
    Ok(())
}
