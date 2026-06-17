use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::{Database, JobQueue};
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, dispatch_and_reply, DispatchParams};
use trios_mb_types::generation::MediaType;

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_neuro_coder_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let chat_id = msg.chat.id;

    let prompt = match msg.text() {
        Some(t) => t.to_string(),
        None => {
            bot.send_message(chat_id, if lang.is_russian() { "Опишите задачу для генерации кода" } else { "Describe the code generation task" }).await?;
            return Ok(());
        }
    };

    if prompt.len() > 4000 {
        let err = if lang.is_russian() { "❌ Текст слишком длинный. Максимум 4000 символов." } else { "❌ Text too long. Maximum 4000 characters." };
        bot.send_message(chat_id, err).await?;
        return Ok(());
    }

    let telegram_id = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
    if telegram_id == 0 {
        tracing::warn!("Missing telegram_id; aborting handler");
        return Ok(());
    }

    let params = DispatchParams {
        telegram_id,
        lang,
        media_type: MediaType::Image,
        job_type: "image_rendering",
        cost: 15.0,
        prompt: Some(prompt),
        image_url: None,
        model: Some("neuro-coder".to_string()),
    };
    dispatch_and_reply(&bot, &dialogue, chat_id, &job_queue, &db, params).await
}
