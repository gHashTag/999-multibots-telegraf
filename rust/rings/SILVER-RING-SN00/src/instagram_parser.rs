use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use crate::generation_utils::load_lang;

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_instagram_parser_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let text = if lang.is_russian() {
        "🔍 Instagram Parser\n\nОтправьте ссылку на пост или профиль:"
    } else {
        "🔍 Instagram Parser\n\nSend a post or profile link:"
    };
    bot.send_message(msg.chat.id, text).await?;
    dialogue.update(Scene::MainMenu).await?;
    Ok(())
}
