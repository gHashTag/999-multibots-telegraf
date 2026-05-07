use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use crate::generation_utils::load_lang;

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_tech_support_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let text = if lang.is_russian() {
        "💬 Техподдержка\n\nСвяжитесь с нами:\n• @support_bot\n• support@example.com\n\nОпишите проблему, и мы поможем!"
    } else {
        "💬 Tech Support\n\nContact us:\n• @support_bot\n• support@example.com\n\nDescribe the issue and we'll help!"
    };
    bot.send_message(msg.chat.id, text).await?;
    dialogue.update(Scene::MainMenu).await?;
    Ok(())
}
