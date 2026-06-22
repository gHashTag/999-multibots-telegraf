use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::{Database, AiProviderOrchestrator, JobQueue};
use trios_mb_tg::state::{Scene, MorphingState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::{answer_callback_query_timeout, send_message_timeout, dialogue_update_timeout};
use trios_mb_types::generation::MediaType;
use crate::generation_utils::{DispatchParams, load_lang, load_lang_cb, return_to_menu, dispatch_and_reply};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const MAX_MORPHING_IMAGES: usize = 10;
const MAX_MORPHING_TEXT_LEN: usize = 500;

#[tracing::instrument(skip_all)]
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
            send_message_timeout(&bot, msg.chat.id, text, Some(crate::generation_utils::back_cancel_keyboard(lang).into())).await?;
            state.images = Some(Vec::new());
            state.step = 1;
            dialogue_update_timeout(&dialogue, Scene::Morphing(state)).await?;
        }
        1 => {
            if let Some(photos) = msg.photo() {
                let file_id = match photos.last() {
                    Some(p) => p.file.id.clone(),
                    None => {
                        let err = if lang.is_russian() { "❌ Не удалось получить изображение." } else { "❌ Could not retrieve image." };
                        send_message_timeout(&bot, msg.chat.id, err, None).await?;
                        return Ok(());
                    }
                };
                let mut images = match state.images.as_ref() {
                    Some(imgs) => imgs.clone(),
                    None => {
                        let err = if lang.is_russian() { "❌ Сессия устарела. Отправьте изображения заново." } else { "❌ Session expired. Please send images again." };
                        send_message_timeout(&bot, msg.chat.id, err, None).await?;
                        return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                    }
                };
                if images.len() >= MAX_MORPHING_IMAGES {
                    let err = if lang.is_russian() {
                        format!("❌ Максимум {} изображений для морфинга.", MAX_MORPHING_IMAGES)
                    } else {
                        format!("❌ Maximum {} images allowed for morphing.", MAX_MORPHING_IMAGES)
                    };
                    send_message_timeout(&bot, msg.chat.id, err, None).await?;
                    return Ok(());
                }
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
                    send_message_timeout(&bot, msg.chat.id, text, Some(kb.into())).await?;
                } else {
                    let text = if lang.is_russian() {
                        format!("📸 Загружено {}/2 минимум. Отправьте ещё.", count)
                    } else {
                        format!("📸 {}/2 minimum loaded. Send more.", count)
                    };
                    send_message_timeout(&bot, msg.chat.id, text, None).await?;
                }
                dialogue_update_timeout(&dialogue, Scene::Morphing(state)).await?;
            } else if let Some(text) = msg.text() {
                let trimmed = text.trim();
                if trimmed.is_empty() {
                    let err = if lang.is_russian() {
                        "❌ Пустое сообщение не допускается."
                    } else {
                        "❌ Empty message is not allowed."
                    };
                    send_message_timeout(&bot, msg.chat.id, err, None).await?;
                    return Ok(());
                }
                if text.len() > MAX_MORPHING_TEXT_LEN {
                    let err = if lang.is_russian() {
                        "❌ Сообщение слишком длинное."
                    } else {
                        "❌ Message is too long."
                    };
                    send_message_timeout(&bot, msg.chat.id, err, None).await?;
                    return Ok(());
                }
                if trimmed.eq_ignore_ascii_case("отмена") || trimmed.eq_ignore_ascii_case("cancel") {
                    return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
                }
                let err = if lang.is_russian() {
                    "❌ Неизвестная команда. Отправьте изображение или слово «Отмена»."
                } else {
                    "❌ Unknown command. Send an image or the word «Cancel»."
                };
                send_message_timeout(&bot, msg.chat.id, err, None).await?;
            }
        }
        _ => {}
    }
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_morphing_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    _orchestrator: Arc<dyn AiProviderOrchestrator>,
    job_queue: Arc<dyn JobQueue>,
    dialogue: MyDialogue,
    mut state: MorphingState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    answer_callback_query_timeout(&bot, &q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let chat_id = match q.chat_id() {
        Some(id) => id,
        None => return Ok(()),
    };
    let tid = q.from.id.0 as i64;
    if tid <= 0 {
        tracing::warn!("Callback query missing valid telegram_id; aborting morphing handler");
        return Ok(());
    }
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    match data {
        "mor:cancel" => {
            return return_to_menu(&bot, &dialogue, chat_id, lang).await;
        }
        "mor:more" => {
            let text = if lang.is_russian() { "📸 Отправьте следующее изображение:" } else { "📸 Send the next image:" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        "mor:generate" => {
            let images = match state.images.as_ref() {
                Some(imgs) => imgs.clone(),
                None => {
                    let err = if lang.is_russian() { "❌ Сессия устарела. Отправьте изображения заново." } else { "❌ Session expired. Please send images again." };
                    send_message_timeout(&bot, chat_id, err, None).await?;
                    return return_to_menu(&bot, &dialogue, chat_id, lang).await;
                }
            };
            if images.len() < 2 {
                let err = if lang.is_russian() { "❌ Нужно минимум 2 изображения." } else { "❌ Need at least 2 images." };
                send_message_timeout(&bot, chat_id, err, None).await?;
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
            send_message_timeout(&bot, chat_id, text, Some(kb.into())).await?;
            state.step = 2;
            dialogue_update_timeout(&dialogue, Scene::Morphing(state)).await?;
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
            send_message_timeout(&bot, chat_id, text, Some(kb.into())).await?;
            dialogue_update_timeout(&dialogue, Scene::Morphing(state)).await?;
        }
        "mor:back_upload" => {
            state.step = 1;
            let text = if lang.is_russian() { "📸 Отправьте следующее изображение:" } else { "📸 Send the next image:" };
            send_message_timeout(&bot, chat_id, text, None).await?;
            dialogue_update_timeout(&dialogue, Scene::Morphing(state)).await?;
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
            let images = match state.images.as_ref() {
                Some(imgs) if imgs.len() >= 2 => imgs,
                _ => {
                    let err = if lang.is_russian() { "❌ Нужно минимум 2 изображения." } else { "❌ Need at least 2 images." };
                    send_message_timeout(&bot, chat_id, err, None).await?;
                    return return_to_menu(&bot, &dialogue, chat_id, lang).await;
                }
            };
            let images_joined = images.join(",");
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
