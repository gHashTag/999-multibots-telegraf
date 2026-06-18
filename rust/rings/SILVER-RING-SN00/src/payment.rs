use std::sync::Arc;
use teloxide::dispatching::dialogue::GetChatId;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, PaymentFlowState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::answer_callback_query_timeout;
use trios_mb_tg::{send_message_timeout, dialogue_update_timeout};
use crate::generation_utils::{load_lang, load_lang_cb};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

#[tracing::instrument(skip_all)]
pub async fn handle_payment_entry(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    let kb = InlineKeyboardMarkup::new(vec![
        vec![InlineKeyboardButton::callback(
            if lang.is_russian() { "⭐ Telegram Stars" } else { "⭐ Telegram Stars" },
            "pay:stars",
        )],
        vec![InlineKeyboardButton::callback(
            if lang.is_russian() { "💳 Банковская карта" } else { "💳 Bank Card" },
            "pay:ruble",
        )],
        vec![InlineKeyboardButton::callback(
            if lang.is_russian() { "🪙 TON" } else { "🪙 TON" },
            "pay:ton",
        )],
        vec![InlineKeyboardButton::callback(
            if lang.is_russian() { "💰 Крипто" } else { "💰 Crypto" },
            "pay:crypto",
        )],
    ]);

    let text = trios_mb_i18n::t(lang, "top_up");
    send_message_timeout(&bot, msg.chat.id, text, Some(kb.into())).await?;
    dialogue_update_timeout(&dialogue, Scene::Payment(PaymentFlowState::default())).await?;
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_payment_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    state: PaymentFlowState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    const MAX_PAYMENT_TEXT_LEN: usize = 32;
    if let Some(text) = msg.text() {
        if text.len() > MAX_PAYMENT_TEXT_LEN {
            let err = if lang.is_russian() { "❌ Слишком длинная сумма." } else { "❌ Amount text too long." };
            send_message_timeout(&bot, msg.chat.id, err, None).await?;
            return Ok(());
        }
        if let Ok(amount) = text.parse::<f64>() {
            if amount.is_finite() && amount > 0.0 {
                let mut new_state = state;
                new_state.amount = Some(amount);
                let text = if lang.is_russian() {
                    format!("Пополнение на {:.2} ₽ обрабатывается...", amount)
                } else {
                    format!("Top up {:.2} is being processed...", amount)
                };
                send_message_timeout(&bot, msg.chat.id, text, None).await?;
                dialogue_update_timeout(&dialogue, Scene::Payment(new_state)).await?;
                return Ok(());
            }
        }
    }
    let text = if lang.is_russian() { "Введите сумму пополнения:" } else { "Enter top-up amount:" };
    send_message_timeout(&bot, msg.chat.id, text, None).await?;
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_payment_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    state: PaymentFlowState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    answer_callback_query_timeout(&bot, &q.id).await?;
    let tid = q.from.id.0 as i64;
    if tid <= 0 {
        tracing::warn!("Callback query missing valid telegram_id; aborting handler");
        return Ok(());
    }

    let lang = load_lang_cb(&db, &q).await;

    let data = match &q.data {
        Some(d) => d.as_str(),
        None => return Ok(()),
    };

    let method = match data {
        "pay:stars" => "stars",
        "pay:ruble" => "ruble",
        "pay:ton" => "ton",
        "pay:crypto" => "crypto",
        _ => return Ok(()),
    };

    let mut new_state = state;
    new_state.method = Some(method.to_string());

    let text = if lang.is_russian() { "Введите сумму пополнения:" } else { "Enter top-up amount:" };
    let chat_id = match q.chat_id() {
        Some(id) => id,
        None => return Ok(()),
    };
    send_message_timeout(&bot, chat_id, text, None).await?;
    dialogue_update_timeout(&dialogue, Scene::Payment(new_state)).await?;
    Ok(())
}
