use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::{HandlerResult, send_message_timeout, dialogue_update_timeout};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

#[tracing::instrument(skip_all)]
pub async fn handle_help(
    bot: teloxide::Bot,
    _db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
    lang: trios_mb_types::user::Language,
) -> HandlerResult {
    let text = trios_mb_i18n::t(lang, "help");
    send_message_timeout(&bot, msg.chat.id, text, None).await?;
    dialogue_update_timeout(&dialogue, Scene::Help).await?;
    Ok(())
}
