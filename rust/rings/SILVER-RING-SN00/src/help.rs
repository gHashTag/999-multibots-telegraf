use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_help(
    bot: teloxide::Bot,
    _db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
    lang: trios_mb_types::user::Language,
) -> HandlerResult {
    let text = trios_mb_i18n::t(lang, "help");
    bot.send_message(msg.chat.id, text).await?;
    dialogue.update(Scene::Help).await?;
    Ok(())
}
