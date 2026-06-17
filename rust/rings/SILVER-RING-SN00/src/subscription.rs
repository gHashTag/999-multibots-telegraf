use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use crate::generation_utils::load_lang;
use crate::generation_utils::return_to_menu;

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

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
        Some(st) => if lang.is_russian() { format!("Текущая подписка: {:?}", st) } else { format!("Current subscription: {:?}", st) },
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
    bot.send_message(msg.chat.id, text).reply_markup(kb).await?;
    Ok(())
}

pub async fn handle_subscription_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = crate::generation_utils::load_lang_cb(&db, &q).await;
    let chat_id = q.chat_id().unwrap();
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    match data {
        "sub:back" => {
            return return_to_menu(&bot, &dialogue, chat_id, lang).await;
        }
        "sub:neuro_photo" | "sub:neuro_video" | "sub:stars" => {
            let text = if lang.is_russian() { "Скоро будет доступно!" } else { "Coming soon!" };
            bot.send_message(chat_id, text).await?;
        }
        _ => {}
    }
    Ok(())
}
