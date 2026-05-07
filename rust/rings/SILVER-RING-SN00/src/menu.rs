use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use trios_mb_tg::keyboards::main_menu_keyboard;

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_menu(
    bot: teloxide::Bot,
    _db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
    lang: trios_mb_types::user::Language,
) -> HandlerResult {
    bot.send_message(msg.chat.id, trios_mb_i18n::t(lang, "main_menu"))
        .reply_markup(main_menu_keyboard(lang))
        .await?;
    dialogue.update(Scene::MainMenu).await?;
    Ok(())
}
