use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use trios_mb_tg::answer_callback_query_timeout;
use trios_mb_tg::send_message_timeout;
use trios_mb_types::user::SubscriptionType;
use crate::generation_utils::load_lang;
use crate::generation_utils::return_to_menu;

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

#[tracing::instrument(skip_all)]
pub async fn handle_subscription_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let tid = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
    if tid == 0 {
        tracing::warn!("Missing telegram_id; aborting handler");
        return Ok(());
    }

    let current_sub = db.check_subscription(tid).await.ok().flatten();
    let sub_text = match current_sub {
        Some(st) => {
            let name = match st {
                SubscriptionType::NeuroPhoto => "NeuroPhoto",
                SubscriptionType::NeuroVideo => "NeuroVideo",
                SubscriptionType::Stars => "Stars",
                SubscriptionType::NeuroTester => "NeuroTester",
            };
            if lang.is_russian() {
                format!("Текущая подписка: {}", name)
            } else {
                format!("Current subscription: {}", name)
            }
        }
        None => if lang.is_russian() { "Нет активной подписки".to_string() } else { "No active subscription".to_string() },
    };

    let kb = InlineKeyboardMarkup::new(vec![
        vec![InlineKeyboardButton::callback(
            if lang.is_russian() { "💫 NeuroPhoto (199₽/мес)" } else { "💫 NeuroPhoto ($2.99/mo)" },
            "sub:neuro_photo",
        )],
        vec![InlineKeyboardButton::callback(
            if lang.is_russian() { "🎬 NeuroVideo (499₽/мес)" } else { "🎬 NeuroVideo ($6.99/mo)" },
            "sub:neuro_video",
        )],
        vec![InlineKeyboardButton::callback(
            if lang.is_russian() { "⭐ Stars (299₽/мес)" } else { "⭐ Stars ($4.99/mo)" },
            "sub:stars",
        )],
        vec![InlineKeyboardButton::callback(
            if lang.is_russian() { "🏠 В меню" } else { "🏠 To menu" },
            "sub:back",
        )],
    ]);

    let text = if lang.is_russian() {
        format!("💫 Подписки\n\n{}\n\nВыберите план:", sub_text)
    } else {
        format!("💫 Subscriptions\n\n{}\n\nChoose a plan:", sub_text)
    };
    send_message_timeout(&bot, msg.chat.id, text, Some(kb.into())).await?;
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_subscription_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    answer_callback_query_timeout(&bot, &q.id).await?;
    let lang = crate::generation_utils::load_lang_cb(&db, &q).await;
    let chat_id = match q.chat_id() {
        Some(id) => id,
        None => return Ok(()),
    };
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    match data {
        "sub:back" => {
            return return_to_menu(&bot, &dialogue, chat_id, lang).await;
        }
        "sub:neuro_photo" | "sub:neuro_video" | "sub:stars" => {
            let text = if lang.is_russian() { "Скоро будет доступно!" } else { "Coming soon!" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        _ => {}
    }
    Ok(())
}
