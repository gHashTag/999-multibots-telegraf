use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, EmailState};
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, return_to_menu};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_email_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    mut state: EmailState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    if state.step == 0 {
        let text = if lang.is_russian() {
            "📧 Введите ваш email:"
        } else {
            "📧 Enter your email:"
        };
        bot.send_message(msg.chat.id, text).await?;
        state.step = 1;
        dialogue.update(Scene::Email(state)).await?;
        return Ok(());
    }

    if state.step == 1 {
        if let Some(text) = msg.text() {
            let email = text.trim();
            if !email.contains('@') || !email.contains('.') {
                let err = if lang.is_russian() { "❌ Некорректный email" } else { "❌ Invalid email" };
                bot.send_message(msg.chat.id, err).await?;
                return Ok(());
            }
            state.email = Some(email.to_string());
            let text = if lang.is_russian() {
                format!("✅ Email {} сохранён!", email)
            } else {
                format!("✅ Email {} saved!", email)
            };
            bot.send_message(msg.chat.id, text).await?;
            return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
        }
    }
    Ok(())
}
