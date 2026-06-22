use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use crate::generation_utils::load_lang;
use crate::generation_utils::return_to_menu;
use trios_mb_tg::send_message_timeout;

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const DB_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);

#[tracing::instrument(skip_all)]
pub async fn handle_invite_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let tid = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
    if tid == 0 {
        tracing::warn!("Missing telegram_id; aborting handler");
        return Ok(());
    }

    let intro = match tokio::time::timeout(DB_TIMEOUT, db.get_referral_count(tid)).await {
        Ok(Ok(ref_count)) => {
            if lang.is_russian() {
                format!(
                    "🎁 Пригласите друга и получите бонусные звёзды!\n\n👥 Рефералов: {}\n\nОтправьте другу эту ссылку:",
                    ref_count
                )
            } else {
                format!(
                    "🎁 Invite a friend and get bonus stars!\n\n👥 Referrals: {}\n\nSend this link to a friend:",
                    ref_count
                )
            }
        }
        Ok(Err(e)) => {
            tracing::error!(error = %e, telegram_id = tid, "Failed to load referral count");
            if lang.is_russian() {
                "❌ Не удалось загрузить количество рефералов. Попробуйте позже.".to_string()
            } else {
                "❌ Unable to load referral count. Please try again later.".to_string()
            }
        }
        Err(_) => {
            tracing::warn!(telegram_id = tid, "DB timeout loading referral count");
            if lang.is_russian() {
                "❌ Не удалось загрузить количество рефералов. Попробуйте позже.".to_string()
            } else {
                "❌ Unable to load referral count. Please try again later.".to_string()
            }
        }
    };

    send_message_timeout(
        &bot, msg.chat.id, intro, None,
    ).await?;
    return_to_menu(&bot, &dialogue, msg.chat.id, lang).await
}
