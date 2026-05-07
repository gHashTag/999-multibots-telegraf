use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, load_lang_cb};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_size_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let kb = InlineKeyboardMarkup::new(vec![
        vec![
            InlineKeyboardButton::callback("1:1 (1024x1024)", "sz:1_1"),
            InlineKeyboardButton::callback("16:9 (1344x768)", "sz:16_9"),
        ],
        vec![
            InlineKeyboardButton::callback("9:16 (768x1344)", "sz:9_16"),
            InlineKeyboardButton::callback("4:3 (1152x896)", "sz:4_3"),
        ],
        vec![
            InlineKeyboardButton::callback("3:4 (896x1152)", "sz:3_4"),
            InlineKeyboardButton::callback("21:9 (1536x640)", "sz:21_9"),
        ],
    ]);
    let text = if lang.is_russian() { "📐 Выберите размер:" } else { "📐 Select size:" };
    bot.send_message(msg.chat.id, text).reply_markup(kb).await?;
    Ok(())
}

pub async fn handle_size_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _dialogue: MyDialogue,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let chat_id = q.chat_id().unwrap();
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    let size = match data {
        "sz:1_1" => "1:1 (1024x1024)",
        "sz:16_9" => "16:9 (1344x768)",
        "sz:9_16" => "9:16 (768x1344)",
        "sz:4_3" => "4:3 (1152x896)",
        "sz:3_4" => "3:4 (896x1152)",
        "sz:21_9" => "21:9 (1536x640)",
        _ => return Ok(()),
    };
    let text = if lang.is_russian() {
        format!("✅ Выбран размер: {}", size)
    } else {
        format!("✅ Selected size: {}", size)
    };
    bot.send_message(chat_id, text).await?;
    Ok(())
}
