use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, MorphingState};
use trios_mb_tg::HandlerResult;
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

pub async fn handle_morphing_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    _job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: MorphingState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    match state.step {
        0 => {
            let text = if lang.is_russian() {
                "🌀 Infinity Морфинг\n\nОтправьте первое изображение (минимум 2):"
            } else {
                "🌀 Infinity Morphing\n\nSend the first image (minimum 2):"
            };
            bot.send_message(msg.chat.id, text)
                .reply_markup(crate::generation_utils::back_cancel_keyboard(lang))
                .await?;
            state.images = Some(Vec::new());
            state.step = 1;
            dialogue.update(Scene::Morphing(state)).await?;
        }
        1 => {
            if let Some(photos) = msg.photo() {
                let file_id = photos.last().map(|p| p.file.id.clone()).unwrap_or_default();
                let mut images = state.images.clone().unwrap_or_default();
                images.push(file_id);
                state.images = Some(images.clone());

                let count = images.len();
                if count >= 2 {
                    let kb = InlineKeyboardMarkup::new(vec![
                        vec![InlineKeyboardButton::callback(
                            if lang.is_russian() { "✅ Создать морфинг" } else { "✅ Create morphing" },
                            "mor:generate",
                        )],
                        vec![InlineKeyboardButton::callback(
                            if lang.is_russian() { "➕ Добавить ещё" } else { "➕ Add more" },
                            "mor:more",
                        )],
                        vec![InlineKeyboardButton::callback(
                            if lang.is_russian() { "❌ Отмена" } else { "❌ Cancel" },
                            "mor:cancel",
                        )],
                    ]);
                    let text = if lang.is_russian() {
                        format!("📸 Загружено {} изображений\n\nМинимум достигнут. Добавьте ещё или создайте морфинг.", count)
                    } else {
                        format!("📸 {} images uploaded\n\nMinimum reached. Add more or create morphing.", count)
                    };
                    bot.send_message(msg.chat.id, text).reply_markup(kb).await?;
                } else {
                    let text = if lang.is_russian() {
                        format!("📸 Загружено {}/2 минимум. Отправьте ещё.", count)
                    } else {
                        format!("📸 {}/2 minimum loaded. Send more.", count)
                    };
                    bot.send_message(msg.chat.id, text).await?;
                }
                dialogue.update(Scene::Morphing(state)).await?;
            } else if let Some(text) = msg.text() {
                if text.contains("Отмена") || text.contains("Cancel") {
                    return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                }
            }
        }
        _ => {}
    }
    Ok(())
}

pub async fn handle_morphing_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: MorphingState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let chat_id = q.chat_id().unwrap();
    let tid = q.from.id.0 as i64;
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    match data {
        "mor:cancel" => {
            return return_to_menu(&bot, &dialogue, chat_id, lang).await;
        }
        "mor:more" => {
            let text = if lang.is_russian() { "📸 Отправьте следующее изображение:" } else { "📸 Send the next image:" };
            bot.send_message(chat_id, text).await?;
        }
        "mor:generate" => {
            let images = state.images.clone().unwrap_or_default();
            if images.len() < 2 {
                let err = if lang.is_russian() { "❌ Нужно минимум 2 изображения." } else { "❌ Need at least 2 images." };
                bot.send_message(chat_id, err).await?;
                return Ok(());
            }

            let kb = InlineKeyboardMarkup::new(vec![
                vec![InlineKeyboardButton::callback(
                    if lang.is_russian() { "🔄 С зацикливанием" } else { "🔄 With Loop" },
                    "mor:loop",
                )],
                vec![InlineKeyboardButton::callback(
                    if lang.is_russian() { "➡️ Без зацикливания" } else { "➡️ No Loop" },
                    "mor:linear",
                )],
                vec![InlineKeyboardButton::callback(
                    if lang.is_russian() { "🔙 Назад" } else { "🔙 Back" },
                    "mor:back_upload",
                )],
            ]);
            let text = if lang.is_russian() { "🔄 Выберите тип морфинга:" } else { "🔄 Choose morphing type:" };
            bot.send_message(chat_id, text).reply_markup(kb).await?;
            state.step = 2;
            dialogue.update(Scene::Morphing(state)).await?;
        }
        "mor:loop" | "mor:linear" => {
            state.morphing_type = Some(if data == "mor:loop" { "loop" } else { "linear" }.to_string());
            state.step = 3;

            let kb = InlineKeyboardMarkup::new(vec![
                vec![InlineKeyboardButton::callback("🎥 Cinematic", "mor:prompt_cinematic")],
                vec![InlineKeyboardButton::callback("⚡ Dramatic", "mor:prompt_dramatic")],
                vec![InlineKeyboardButton::callback("🌊 Smooth", "mor:prompt_smooth")],
                vec![InlineKeyboardButton::callback("🎨 Creative", "mor:prompt_artistic")],
            ]);
            let text = if lang.is_russian() { "🎬 Выберите стиль переходов:" } else { "🎬 Choose transition style:" };
            bot.send_message(chat_id, text).reply_markup(kb).await?;
            dialogue.update(Scene::Morphing(state)).await?;
        }
        "mor:back_upload" => {
            state.step = 1;
            let text = if lang.is_russian() { "📸 Отправьте следующее изображение:" } else { "📸 Send the next image:" };
            bot.send_message(chat_id, text).await?;
            dialogue.update(Scene::Morphing(state)).await?;
        }
        d if d.starts_with("mor:prompt_") => {
            let prompt = match d {
                "mor:prompt_cinematic" => "smooth cinematic transition, elegant camera glide, professional cinematography, soft lighting, 4k quality",
                "mor:prompt_dramatic" => "high energy dramatic transition, powerful emotional impact, intense lighting changes, dynamic camera movement",
                "mor:prompt_smooth" => "seamless gradual transition, ultra-smooth morphing, gentle motion blur, fluid movement, natural flow, 60fps quality",
                "mor:prompt_artistic" => "creative abstract transition, unique visual transformation, artistic morphing effect, fluid color blending",
                _ => "smooth cinematic transition",
            };
            state.prompt = Some(prompt.to_string());
            let images_joined = state.images.clone().unwrap_or_default().join(",");
            return dispatch_and_reply(
                &bot, &dialogue, chat_id,
                &job_queue, &db,
                DispatchParams {
                    telegram_id: tid,
                    lang,
                    media_type: MediaType::Morphing,
                    job_type: "morphing_rendering",
                    cost: 10.0,
                    prompt: state.prompt.clone(),
                    image_url: Some(images_joined),
                    model: None,
                },
            ).await;
        }
        _ => {}
    }
    Ok(())
}
