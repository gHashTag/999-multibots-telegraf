use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::{Database, JobQueue};
use trios_mb_tg::state::Scene;
use trios_mb_tg::HandlerResult;
use trios_mb_tg::keyboards::main_menu_keyboard;
use trios_mb_tg::{send_message_timeout, dialogue_update_timeout};
use trios_mb_types::user::Language;
use trios_mb_types::generation::*;
use trios_mb_traits::job_queue::EnqueueRequest;

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

#[tracing::instrument(skip_all)]
pub async fn load_lang(db: &Arc<dyn Database>, msg: &Message) -> Language {
    match msg.from {
        Some(ref user) => load_lang_by_id(db, user.id.0 as i64).await,
        None => Language::default(),
    }
}

#[tracing::instrument(skip_all)]
pub async fn load_lang_by_id(db: &Arc<dyn Database>, telegram_id: i64) -> Language {
    db.get_user_by_telegram_id(telegram_id)
        .await
        .ok()
        .flatten()
        .map(|u| u.language)
        .unwrap_or_default()
}

#[tracing::instrument(skip_all)]
pub async fn load_lang_cb(db: &Arc<dyn Database>, q: &teloxide::types::CallbackQuery) -> Language {
    db.get_user_by_telegram_id(q.from.id.0 as i64)
        .await
        .ok()
        .flatten()
        .map(|u| u.language)
        .unwrap_or_default()
}

#[tracing::instrument(skip_all)]
pub async fn deduct_balance(
    db: &Arc<dyn Database>,
    telegram_id: i64,
    cost: f64,
    lang: Language,
) -> Result<f64, String> {
    match db.deduct_balance(telegram_id, cost).await {
        Ok(true) => Ok(0.0),
        Ok(false) => {
            let balance = match db.get_balance(telegram_id).await {
                Ok(b) => b,
                Err(e) => {
                    tracing::error!(telegram_id, error = %e, "Failed to get balance for error message");
                    0.0
                }
            };
            let msg = if lang.is_russian() {
                format!("❌ Недостаточно средств.\n\nТребуется: {:.0} ⭐\nВаш баланс: {:.1} ⭐", cost, balance)
            } else {
                format!("❌ Insufficient funds.\n\nRequired: {:.0} ⭐\nYour balance: {:.1} ⭐", cost, balance)
            };
            Err(msg)
        }
        Err(e) => {
            tracing::error!(error = %e, "DB error during balance deduction");
            let msg = if lang.is_russian() {
                "❌ Ошибка списания средств. Попробуйте позже.".to_string()
            } else {
                "❌ Failed to deduct balance. Please try again later.".to_string()
            };
            Err(msg)
        }
    }
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

#[tracing::instrument(skip_all)]
pub async fn return_to_menu(
    bot: &teloxide::Bot,
    dialogue: &MyDialogue,
    chat_id: teloxide::types::ChatId,
    lang: Language,
) -> HandlerResult {
    let _ = send_message_timeout(
        bot, chat_id, trios_mb_i18n::t(lang, "main_menu"),
        Some(main_menu_keyboard(lang).into()),
    ).await;
    let _ = dialogue_update_timeout(dialogue, Scene::MainMenu).await;
    Ok(())
}

pub struct DispatchParams {
    pub telegram_id: i64,
    pub lang: Language,
    pub media_type: MediaType,
    pub job_type: &'static str,
    pub cost: f64,
    pub prompt: Option<String>,
    pub image_url: Option<String>,
    pub model: Option<String>,
}

#[tracing::instrument(skip_all)]
pub async fn dispatch_and_reply(
    bot: &teloxide::Bot,
    dialogue: &MyDialogue,
    chat_id: teloxide::types::ChatId,
    job_queue: &Arc<dyn JobQueue>,
    db: &Arc<dyn Database>,
    params: DispatchParams,
) -> HandlerResult {
    if let Err(err_msg) = deduct_balance(db, params.telegram_id, params.cost, params.lang).await {
        let _ = send_message_timeout(bot, chat_id, err_msg, None).await;
        let _ = dialogue_update_timeout(dialogue, Scene::MainMenu).await;
        return Ok(());
    }

    let processing = if params.lang.is_russian() {
        "⏳ Задача отправлена в обработку. Результат будет отправлен сообщением."
    } else {
        "⏳ Task submitted for processing. Result will be sent as a message."
    };
    let _ = send_message_timeout(bot, chat_id, processing, None).await;

    let request = GenerationRequest {
        telegram_id: params.telegram_id,
        media_type: params.media_type,
        prompt: params.prompt,
        image_url: params.image_url,
        model: params.model,
        params: serde_json::json!({ "cost": params.cost }),
    };

    let gen = db.create_generation(&request).await;
    match gen {
        Ok(g) => {
            let mut request = request;
            request.params = serde_json::json!({
                "cost": params.cost,
                "generation_id": g.id.to_string(),
            });
            let payload = serde_json::to_value(&request).map_err(|e| {
                tracing::error!(telegram_id = params.telegram_id, error = %e, "Failed to serialize generation request");
                trios_mb_types::AppError::Validation(format!("Failed to serialize request: {}", e))
            })?;
            let enqueue_req = EnqueueRequest {
                job_type: params.job_type.to_string(),
                payload,
                max_attempts: Some(3),
                delay_secs: None,
            };
            match job_queue.enqueue(enqueue_req).await {
                Ok(_job) => {
                    tracing::info!(telegram_id = params.telegram_id, media_type = ?params.media_type, cost = params.cost, "Generation job enqueued (balance deducted)");
                }
                Err(e) => {
                    tracing::error!(telegram_id = params.telegram_id, error = %e, "Failed to enqueue generation, refunding");
                    if let Err(refund_err) = db.add_balance(params.telegram_id, params.cost).await {
                        tracing::error!(telegram_id = params.telegram_id, error = %refund_err, "CRITICAL: Failed to refund balance after enqueue failure");
                    }
                    let err_msg = if params.lang.is_russian() {
                        "❌ Не удалось отправить задачу. Попробуйте позже.".to_string()
                    } else {
                        "❌ Could not submit task. Please try again later.".to_string()
                    };
                    let _ = send_message_timeout(bot, chat_id, err_msg, None).await;
                }
            }
        }
        Err(e) => {
            tracing::error!(telegram_id = params.telegram_id, error = %e, "Failed to create generation, refunding");
            if let Err(refund_err) = db.add_balance(params.telegram_id, params.cost).await {
                tracing::error!(telegram_id = params.telegram_id, error = %refund_err, "CRITICAL: Failed to refund balance after generation creation failure");
            }
            let err_msg = if params.lang.is_russian() {
                "❌ Не удалось создать задачу. Попробуйте позже.".to_string()
            } else {
                "❌ Could not create task. Please try again later.".to_string()
            };
            let _ = send_message_timeout(bot, chat_id, err_msg, None).await;
        }
    }

    let _ = dialogue_update_timeout(dialogue, Scene::MainMenu).await;
    Ok(())
}
