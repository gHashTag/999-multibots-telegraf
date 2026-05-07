use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::{Database, JobQueue};
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use trios_mb_tg::keyboards::main_menu_keyboard;
use trios_mb_types::user::Language;
use trios_mb_types::generation::*;
use trios_mb_traits::job_queue::EnqueueRequest;

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn load_lang(db: &Arc<dyn Database>, msg: &Message) -> Language {
    match msg.from {
        Some(ref user) => load_lang_by_id(db, user.id.0 as i64).await,
        None => Language::default(),
    }
}

pub async fn load_lang_by_id(db: &Arc<dyn Database>, telegram_id: i64) -> Language {
    db.get_user_by_telegram_id(telegram_id)
        .await
        .ok()
        .flatten()
        .map(|u| u.language)
        .unwrap_or_default()
}

pub async fn load_lang_cb(db: &Arc<dyn Database>, q: &teloxide::types::CallbackQuery) -> Language {
    db.get_user_by_telegram_id(q.from.id.0 as i64)
        .await
        .ok()
        .flatten()
        .map(|u| u.language)
        .unwrap_or_default()
}

pub async fn check_balance(
    db: &Arc<dyn Database>,
    telegram_id: i64,
    cost: f64,
    lang: Language,
) -> Result<f64, String> {
    let balance = db.get_balance(telegram_id).await.unwrap_or(0.0);
    if balance < cost {
        let msg = if lang.is_russian() {
            format!("❌ Недостаточно средств.\n\nТребуется: {:.0} ⭐\nВаш баланс: {:.1} ⭐", cost, balance)
        } else {
            format!("❌ Insufficient funds.\n\nRequired: {:.0} ⭐\nYour balance: {:.1} ⭐", cost, balance)
        };
        return Err(msg);
    }
    Ok(balance)
}

pub async fn deduct_balance(
    db: &Arc<dyn Database>,
    telegram_id: i64,
    cost: f64,
) -> bool {
    db.deduct_balance(telegram_id, cost).await.unwrap_or(false)
}

pub fn back_cancel_keyboard(lang: Language) -> InlineKeyboardMarkup {
    let back = if lang.is_russian() { "⬅️ Назад" } else { "⬅️ Back" };
    let cancel = if lang.is_russian() { "❌ Отмена" } else { "❌ Cancel" };
    InlineKeyboardMarkup::new(vec![
        vec![
            InlineKeyboardButton::callback(back.to_string(), "nav:back"),
            InlineKeyboardButton::callback(cancel.to_string(), "nav:cancel"),
        ],
    ])
}

pub async fn return_to_menu(
    bot: &teloxide::Bot,
    dialogue: &MyDialogue,
    chat_id: teloxide::types::ChatId,
    lang: Language,
) -> HandlerResult {
    bot.send_message(chat_id, trios_mb_i18n::t(lang, "main_menu"))
        .reply_markup(main_menu_keyboard(lang))
        .await?;
    dialogue.update(Scene::MainMenu).await?;
    Ok(())
}

pub struct DispatchParams {
    pub telegram_id: i64,
    pub lang: Language,
    pub media_type: MediaType,
    pub job_type: &'static str,
    pub prompt: Option<String>,
    pub image_url: Option<String>,
    pub model: Option<String>,
}

pub async fn dispatch_and_reply(
    bot: &teloxide::Bot,
    dialogue: &MyDialogue,
    chat_id: teloxide::types::ChatId,
    job_queue: &Arc<dyn JobQueue>,
    db: &Arc<dyn Database>,
    params: DispatchParams,
) -> HandlerResult {
    let processing = if params.lang.is_russian() {
        "⏳ Задача отправлена в обработку. Результат будет отправлен сообщением."
    } else {
        "⏳ Task submitted for processing. Result will be sent as a message."
    };
    bot.send_message(chat_id, processing).await?;

    let request = GenerationRequest {
        telegram_id: params.telegram_id,
        media_type: params.media_type,
        prompt: params.prompt,
        image_url: params.image_url,
        model: params.model,
        params: serde_json::json!({}),
    };

    let gen = db.create_generation(&request).await;
    match gen {
        Ok(_g) => {
            let enqueue_req = EnqueueRequest {
                job_type: params.job_type.to_string(),
                payload: serde_json::to_value(&request).unwrap_or_default(),
                max_attempts: Some(3),
                delay_secs: None,
            };
            match job_queue.enqueue(enqueue_req).await {
                Ok(_job) => {
                    tracing::info!(telegram_id = params.telegram_id, media_type = ?params.media_type, "Generation job enqueued");
                }
                Err(e) => {
                    tracing::error!(telegram_id = params.telegram_id, error = %e, "Failed to enqueue generation");
                    let err_msg = if params.lang.is_russian() {
                        format!("❌ Ошибка: {}", e)
                    } else {
                        format!("❌ Error: {}", e)
                    };
                    bot.send_message(chat_id, err_msg).await?;
                }
            }
        }
        Err(e) => {
            tracing::error!(telegram_id = params.telegram_id, error = %e, "Failed to create generation");
            let err_msg = if params.lang.is_russian() {
                format!("❌ Ошибка: {}", e)
            } else {
                format!("❌ Error: {}", e)
            };
            bot.send_message(chat_id, err_msg).await?;
        }
    }

    dialogue.update(Scene::MainMenu).await?;
    Ok(())
}
