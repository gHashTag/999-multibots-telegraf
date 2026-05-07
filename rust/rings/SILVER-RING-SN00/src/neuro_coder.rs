use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use crate::generation_utils::load_lang;

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_neuro_coder_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let text = if lang.is_russian() {
        "🧠 NeuroCoder\n\nОтправьте описание того, что нужно сгенерировать:"
    } else {
        "🧠 NeuroCoder\n\nSend a description of what to generate:"
    };
    bot.send_message(msg.chat.id, text).await?;
    dialogue.update(Scene::MainMenu).await?;
    Ok(())
}
