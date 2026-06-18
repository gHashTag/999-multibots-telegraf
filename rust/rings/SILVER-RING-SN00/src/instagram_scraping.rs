use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::{Database, JobQueue};
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, dispatch_and_reply, DispatchParams};
use trios_mb_types::generation::MediaType;

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

#[tracing::instrument(skip_all)]
pub async fn handle_instagram_scraping_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let text = match msg.text() {
        Some(t) => t.to_string(),
        None => {
            let lang = load_lang(&db, &msg).await;
            bot.send_message(msg.chat.id, if lang.is_russian() { "Отправьте ссылку на Instagram профиль" } else { "Send an Instagram profile link" }).await?;
            return Ok(());
        }
    };

    if text.len() > 4000 {
        let lang = load_lang(&db, &msg).await;
        let err = if lang.is_russian() { "❌ Текст слишком длинный. Максимум 4000 символов." } else { "❌ Text too long. Maximum 4000 characters." };
        bot.send_message(msg.chat.id, err).await?;
        return Ok(());
    }

    // Hardened Instagram URL validation: parse with url::Url, enforce exact host whitelist.
    let parsed_url = match url::Url::parse(&text) {
        Ok(u) => u,
        Err(_) => {
            let lang = load_lang(&db, &msg).await;
            bot.send_message(msg.chat.id, if lang.is_russian() { "❌ Неверная ссылка. Отправьте ссылку на Instagram профиль." } else { "❌ Invalid link. Send an Instagram profile link." }).await?;
            return Ok(());
        }
    };

    match parsed_url.scheme() {
        "http" | "https" => {}
        _ => {
            let lang = load_lang(&db, &msg).await;
            bot.send_message(msg.chat.id, if lang.is_russian() { "❌ Неверная ссылка. Отправьте ссылку на Instagram профиль." } else { "❌ Invalid link. Send an Instagram profile link." }).await?;
            return Ok(());
        }
    }

    let host_ok = parsed_url.host_str().map_or(false, |host| {
        let lower = host.to_lowercase();
        lower == "instagram.com" || lower == "www.instagram.com"
    });
    if !host_ok {
        let lang = load_lang(&db, &msg).await;
        bot.send_message(msg.chat.id, if lang.is_russian() { "❌ Неверная ссылка. Отправьте ссылку на Instagram профиль." } else { "❌ Invalid link. Send an Instagram profile link." }).await?;
        return Ok(());
    }

    // Reject URLs with embedded credentials (SSRF defense)
    if !parsed_url.username().is_empty() || parsed_url.password().is_some() {
        let lang = load_lang(&db, &msg).await;
        bot.send_message(msg.chat.id, if lang.is_russian() { "❌ Неверная ссылка. Отправьте ссылку на Instagram профиль." } else { "❌ Invalid link. Send an Instagram profile link." }).await?;
        return Ok(());
    }

    let telegram_id = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
    if telegram_id == 0 {
        tracing::warn!("Missing telegram_id; aborting handler");
        return Ok(());
    }
    let lang = load_lang(&db, &msg).await;
    let chat_id = msg.chat.id;

    let me = match bot.get_me().await {
        Ok(u) => u,
        Err(e) => {
            tracing::warn!("Failed to get bot info: {}", e);
            return Ok(());
        }
    };
    let bot_name = me.user.username.as_deref().unwrap_or("");
    if !trios_mb_tg::access::has_parsing_access(telegram_id, bot_name) {
        tracing::warn!(%telegram_id, %bot_name, "User lacks parsing access for instagram_scraping");
        let err = if lang.is_russian() { "❌ Нет доступа." } else { "❌ Access denied." };
        bot.send_message(chat_id, err).await?;
        return Ok(());
    }

    let params = DispatchParams {
        telegram_id,
        lang,
        media_type: MediaType::Image,
        job_type: "scraping",
        cost: 5.0,
        prompt: Some(text.clone()),
        image_url: None,
        model: None,
    };
    dispatch_and_reply(&bot, &dialogue, chat_id, &job_queue, &db, params).await
}

fn ctx_has_text(msg: &Message) -> bool {
    msg.text().is_some()
}
