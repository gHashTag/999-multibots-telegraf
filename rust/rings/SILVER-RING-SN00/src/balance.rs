use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_balance(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
    lang: trios_mb_types::user::Language,
) -> HandlerResult {
    let tid = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
    let balance = db.get_balance(tid).await.unwrap_or(0.0);
    let text = if lang.is_russian() {
        format!("💰 Ваш баланс: {:.2} ₽", balance)
    } else {
        format!("💰 Your balance: {:.2}", balance)
    };
    bot.send_message(msg.chat.id, text).await?;
    dialogue.update(Scene::Balance).await?;
    Ok(())
}
