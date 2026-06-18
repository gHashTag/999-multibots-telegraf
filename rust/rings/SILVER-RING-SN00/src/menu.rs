use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use trios_mb_tg::{keyboards::main_menu_keyboard, send_message_timeout, dialogue_update_timeout};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

#[tracing::instrument(skip_all)]
pub async fn handle_menu(
    bot: teloxide::Bot,
    _db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
    lang: trios_mb_types::user::Language,
) -> HandlerResult {
    send_message_timeout(&bot, msg.chat.id, trios_mb_i18n::t(lang, "main_menu"), Some(main_menu_keyboard(lang).into())).await?;
    dialogue_update_timeout(&dialogue, Scene::MainMenu).await?;
    Ok(())
}
