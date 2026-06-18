use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use trios_mb_tg::{keyboards::main_menu_keyboard, send_message_timeout, dialogue_update_timeout};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

#[tracing::instrument(skip_all)]
pub async fn handle_change_language(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
    lang: trios_mb_types::user::Language,
) -> HandlerResult {
    let new_lang = if lang.is_russian() {
        trios_mb_types::user::Language::En
    } else {
        trios_mb_types::user::Language::Ru
    };

    let tid = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
    if tid == 0 {
        tracing::warn!("Missing telegram_id; aborting handler");
        return Ok(());
    }
    if let Err(e) = db.update_user_language(tid, new_lang).await {
        tracing::error!(telegram_id = tid, error = %e, "Failed to update user language");
    }

    let text = trios_mb_i18n::t(new_lang, "language_changed");
    send_message_timeout(&bot, msg.chat.id, text, Some(main_menu_keyboard(new_lang).into())).await?;
    dialogue_update_timeout(&dialogue, Scene::MainMenu).await?;
    Ok(())
}
