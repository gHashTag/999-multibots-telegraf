use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, SizeState};
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, load_lang_cb};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_size_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: SizeState,
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
    state.step = 1;
    dialogue.update(Scene::Size(state)).await?;
    Ok(())
}

pub async fn handle_size_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: SizeState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let chat_id = q.chat_id().unwrap();
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    let (w, h, ratio) = match data {
        "sz:1_1" => (1024, 1024, "1:1"),
        "sz:16_9" => (1344, 768, "16:9"),
        "sz:9_16" => (768, 1344, "9:16"),
        "sz:4_3" => (1152, 896, "4:3"),
        "sz:3_4" => (896, 1152, "3:4"),
        "sz:21_9" => (1536, 640, "21:9"),
        _ => return Ok(()),
    };

    state.width = Some(w);
    state.height = Some(h);
    state.aspect_ratio = Some(ratio.to_string());

    let text = if lang.is_russian() {
        format!("✅ Выбран размер: {} ({}x{})", ratio, w, h)
    } else {
        format!("✅ Selected size: {} ({}x{})", ratio, w, h)
    };
    bot.send_message(chat_id, text).await?;
    dialogue.update(Scene::Size(state)).await?;
    Ok(())
}
