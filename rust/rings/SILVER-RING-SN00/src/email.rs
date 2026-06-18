use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, EmailState};
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, return_to_menu};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const MAX_EMAIL_LEN: usize = 254;

/// Validate an email address without pulling in a heavy regex crate.
/// Checks: overall length, exactly one '@', non-empty local part,
/// domain has at least one dot, no leading/trailing/consecutive dots.
fn validate_email(email: &str) -> bool {
    if email.is_empty() || email.len() > MAX_EMAIL_LEN {
        return false;
    }

    // Must contain exactly one '@'
    let parts: Vec<&str> = email.split('@').collect();
    if parts.len() != 2 {
        return false;
    }

    let local = parts[0];
    let domain = parts[1];

    // Local part must be non-empty and not exceed 64 chars
    if local.is_empty() || local.len() > 64 {
        return false;
    }

    // Domain must be non-empty
    if domain.is_empty() {
        return false;
    }

    // Domain must contain at least one dot
    if !domain.contains('.') {
        return false;
    }

    // No leading or trailing dots in local or domain
    if local.starts_with('.') || local.ends_with('.') || domain.starts_with('.') || domain.ends_with('.') {
        return false;
    }

    // No consecutive dots anywhere
    if email.contains("..") {
        return false;
    }

    // Domain labels (between dots) must not be empty
    for label in domain.split('.') {
        if label.is_empty() {
            return false;
        }
    }

    true
}

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
            if text.len() > MAX_EMAIL_LEN {
                let err = if lang.is_russian() { "❌ Email слишком длинный." } else { "❌ Email too long." };
                bot.send_message(msg.chat.id, err).await?;
                return Ok(());
            }
            let email = text.trim();
            if !validate_email(email) {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_emails() {
        assert!(validate_email("user@example.com"));
        assert!(validate_email("first.last@example.co.uk"));
        assert!(validate_email("user+tag@example.org"));
    }

    #[test]
    fn invalid_emails() {
        assert!(!validate_email(""));
        assert!(!validate_email("plainstring"));
        assert!(!validate_email("@example.com"));
        assert!(!validate_email("user@"));
        assert!(!validate_email("user@.com"));
        assert!(!validate_email("user@example"));
        assert!(!validate_email("user..name@example.com"));
        assert!(!validate_email(".user@example.com"));
        assert!(!validate_email("user.@example.com"));
        assert!(!validate_email("user@example..com"));
        assert!(!validate_email("user name@example.com"));
    }
}
