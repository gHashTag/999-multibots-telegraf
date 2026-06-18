use std::time::Duration;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use teloxide::types::{ChatId, Message, ReplyMarkup};
use tracing;

use crate::state::Scene;

const TELEGRAM_API_TIMEOUT: Duration = Duration::from_secs(30);

/// Send a message to a chat with a hard 30-second timeout.
/// If the Telegram API stalls, returns an `std::io::Error` with `TimedOut` kind
/// instead of hanging the worker forever. The error auto-converts to `HandlerError`
/// at call sites via the `?` operator.
#[tracing::instrument(skip_all, fields(chat_id = %chat_id))]
pub async fn send_message_timeout(
    bot: &Bot,
    chat_id: ChatId,
    text: impl Into<String>,
    reply_markup: Option<ReplyMarkup>,
) -> Result<Message, std::io::Error> {
    let text = text.into();
    let fut = match reply_markup {
        Some(markup) => bot.send_message(chat_id, text).reply_markup(markup),
        None => bot.send_message(chat_id, text),
    };
    match tokio::time::timeout(TELEGRAM_API_TIMEOUT, fut).await {
        Ok(result) => result.map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::Other, format!("Telegram API error: {}", e))
        }),
        Err(_) => {
            tracing::error!(chat_id = %chat_id, "bot.send_message timed out after {}s", TELEGRAM_API_TIMEOUT.as_secs());
            Err(std::io::Error::new(
                std::io::ErrorKind::TimedOut,
                "Telegram API send_message timeout"
            ))
        }
    }
}

/// Answer a callback query with a hard 30-second timeout.
#[tracing::instrument(skip_all, fields(query_id = %query_id))]
pub async fn answer_callback_query_timeout(
    bot: &Bot,
    query_id: &str,
) -> Result<teloxide::types::True, std::io::Error> {
    match tokio::time::timeout(TELEGRAM_API_TIMEOUT, bot.answer_callback_query(query_id)).await {
        Ok(result) => result.map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::Other, format!("Telegram API error: {}", e))
        }),
        Err(_) => {
            tracing::error!(query_id = %query_id, "bot.answer_callback_query timed out after {}s", TELEGRAM_API_TIMEOUT.as_secs());
            Err(std::io::Error::new(
                std::io::ErrorKind::TimedOut,
                "Telegram API answer_callback_query timeout"
            ))
        }
    }
}

/// Update the dialogue state with a hard 30-second timeout.
/// Prevents FSM state-loss when the Telegram API or in-memory storage stalls.
#[tracing::instrument(skip_all)]
pub async fn dialogue_update_timeout(
    dialogue: &Dialogue<Scene, InMemStorage<Scene>>,
    scene: Scene,
) -> Result<(), std::io::Error> {
    match tokio::time::timeout(TELEGRAM_API_TIMEOUT, dialogue.update(scene)).await {
        Ok(result) => result.map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::Other, format!("Telegram API error: {}", e))
        }),
        Err(_) => {
            tracing::error!("dialogue.update timed out after {}s", TELEGRAM_API_TIMEOUT.as_secs());
            Err(std::io::Error::new(
                std::io::ErrorKind::TimedOut,
                "Telegram API dialogue.update timeout"
            ))
        }
    }
}

/// Exit the dialogue with a hard 30-second timeout.
/// Prevents FSM state-loss when the Telegram API or in-memory storage stalls.
#[tracing::instrument(skip_all)]
pub async fn dialogue_exit_timeout(
    dialogue: &Dialogue<Scene, InMemStorage<Scene>>,
) -> Result<(), std::io::Error> {
    match tokio::time::timeout(TELEGRAM_API_TIMEOUT, dialogue.exit()).await {
        Ok(result) => result.map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::Other, format!("Telegram API error: {}", e))
        }),
        Err(_) => {
            tracing::error!("dialogue.exit timed out after {}s", TELEGRAM_API_TIMEOUT.as_secs());
            Err(std::io::Error::new(
                std::io::ErrorKind::TimedOut,
                "Telegram API dialogue.exit timeout"
            ))
        }
    }
}
