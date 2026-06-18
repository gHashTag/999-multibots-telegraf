use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

#[tracing::instrument(skip_all)]
pub async fn handle_balance(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
    lang: trios_mb_types::user::Language,
) -> HandlerResult {
    let tid = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
    if tid == 0 {
        tracing::warn!("Missing telegram_id; aborting handler");
        return Ok(());
    }
    let balance = match db.get_balance(tid).await {
        Ok(b) => b,
        Err(e) => {
            tracing::error!(telegram_id = tid, error = %e, "Failed to get balance");
            let err = if lang.is_russian() {
                "❌ Не удалось получить баланс. Попробуйте позже.".to_string()
            } else {
                "❌ Could not retrieve balance. Please try again later.".to_string()
            };
            bot.send_message(msg.chat.id, err).await?;
            return Ok(());
        }
    };
    let text = if lang.is_russian() {
        format!("💰 Ваш баланс: {:.2} ₽", balance)
    } else {
        format!("💰 Your balance: {:.2}", balance)
    };
    bot.send_message(msg.chat.id, text).await?;
    dialogue.update(Scene::Balance).await?;
    Ok(())
}
