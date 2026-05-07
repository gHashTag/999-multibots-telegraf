use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, AvatarBrainState};
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, load_lang_cb, return_to_menu};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

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
            bot.send_message(msg.chat.id, text)
                .reply_markup(crate::generation_utils::back_cancel_keyboard(lang))
                .await?;
            state.step = 1;
            dialogue.update(Scene::AvatarBrain(state)).await?;
        }
        1 => {
            if let Some(text) = msg.text() {
                if text.trim().is_empty() || text.trim().len() > 100 {
                    let err = if lang.is_russian() {
                        "❌ Название компании должно быть короче 100 символов"
                    } else {
                        "❌ Company name must be less than 100 characters"
                    };
                    bot.send_message(msg.chat.id, err).await?;
                    return Ok(());
                }
                state.name = Some(text.trim().to_string());
                state.step = 2;
                let prompt = if lang.is_russian() { "💼 Укажите вашу должность" } else { "💼 Enter your position" };
                bot.send_message(msg.chat.id, prompt).await?;
                dialogue.update(Scene::AvatarBrain(state)).await?;
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
                    bot.send_message(msg.chat.id, err).await?;
                    return Ok(());
                }
                state.personality = Some(text.trim().to_string());
                state.step = 3;
                let prompt = if lang.is_russian() {
                    "🛠️ Опишите ваши профессиональные навыки"
                } else {
                    "🛠️ Describe your professional skills"
                };
                bot.send_message(msg.chat.id, prompt).await?;
                dialogue.update(Scene::AvatarBrain(state)).await?;
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
                    bot.send_message(msg.chat.id, err).await?;
                    return Ok(());
                }

                let company = state.name.clone().unwrap_or_default();
                let position = state.personality.clone().unwrap_or_default();
                let skills = text.trim().to_string();

                let text = if lang.is_russian() {
                    format!("✨ Мозг аватара успешно создан!\n\n📋 Сводка:\n• Компания: {}\n• Должность: {}\n• Навыки: {}", company, position, skills)
                } else {
                    format!("✨ Avatar's brain successfully created!\n\n📋 Summary:\n• Company: {}\n• Position: {}\n• Skills: {}", company, position, skills)
                };
                bot.send_message(msg.chat.id, text).await?;
                return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
            }
        }
        _ => {}
    }
    Ok(())
}

pub async fn handle_avatar_brain_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    _state: AvatarBrainState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    if data == "ab:cancel" {
        return return_to_menu(&bot, &dialogue, q.chat_id().unwrap(), lang).await;
    }
    Ok(())
}
