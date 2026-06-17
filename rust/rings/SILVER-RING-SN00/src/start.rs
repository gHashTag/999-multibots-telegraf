use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use trios_mb_tg::keyboards::main_menu_keyboard;

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_start(
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
    let username = msg.from.as_ref().and_then(|u| u.username.clone());

    let user = match db.get_user_by_telegram_id(tid).await {
        Ok(Some(u)) => u,
        Ok(None) => {
            db.create_user(tid, username.as_deref(), lang).await?
        }
        Err(e) => {
            tracing::error!(telegram_id = tid, error = %e, "Failed to look up user on /start");
            let err_text = if lang.is_russian() {
                "❌ Ошибка при входе. Попробуйте позже."
            } else {
                "❌ Login error. Please try again later."
            };
            bot.send_message(msg.chat.id, err_text).await?;
            return Ok(());
        }
    };

    let greet = if user.language.is_russian() { "👋 Добро пожаловать!" } else { "👋 Welcome!" };
    let text = format!("{}\n\n{}", greet, trios_mb_i18n::t(user.language, "main_menu"));
    bot.send_message(msg.chat.id, text)
        .reply_markup(main_menu_keyboard(user.language))
        .await?;
    dialogue.update(Scene::MainMenu).await?;
    Ok(())
}
