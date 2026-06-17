use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, AiCoverState};
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, load_lang_cb, return_to_menu, deduct_balance};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const AI_COVER_COST: f64 = 10.0;

#[tracing::instrument(skip_all)]
pub async fn handle_ai_cover_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    mut state: AiCoverState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    match state.step {
        0 => {
            let text = if lang.is_russian() {
                "🎧 AI Cover - Песня вашим голосом\n\nОтправьте песню (MP3, WAV, OGG).\n💰 Стоимость: 10⭐\n⏱️ Время: 1-3 минуты"
            } else {
                "🎧 AI Cover - Song with your voice\n\nSend a song (MP3, WAV, OGG).\n💰 Cost: 10⭐\n⏱️ Time: 1-3 minutes"
            };
            bot.send_message(msg.chat.id, text)
                .reply_markup(InlineKeyboardMarkup::new(vec![
                    vec![InlineKeyboardButton::callback(
                        if lang.is_russian() { "🏠 В меню" } else { "🏠 To menu" },
                        "ac:back_menu",
                    )],
                ]))
                .await?;
            state.step = 1;
            dialogue.update(Scene::AiCover(state)).await?;
        }
        1 => {
            if let Some(audio) = msg.audio() {
                state.audio_url = Some(audio.file.id.clone());
                state.step = 2;

                let duration: u32 = audio.duration.seconds();
                let title = audio.title.clone().unwrap_or_else(|| "Unknown".to_string());

                let kb = InlineKeyboardMarkup::new(vec![
                    vec![InlineKeyboardButton::callback(
                        if lang.is_russian() { "✅ Создать AI Cover (10⭐)" } else { "✅ Create AI Cover (10⭐)" },
                        "ac:confirm",
                    )],
                    vec![InlineKeyboardButton::callback(
                        if lang.is_russian() { "❌ Отмена" } else { "❌ Cancel" },
                        "ac:back_menu",
                    )],
                ]);
                let text = if lang.is_russian() {
                    format!("🎵 Песня принята!\n\n📀 {}\n📏 Длительность: {} сек\n💰 Стоимость: 10⭐", title, duration)
                } else {
                    format!("🎵 Song accepted!\n\n📀 {}\n📏 Duration: {} sec\n💰 Cost: 10⭐", title, duration)
                };
                bot.send_message(msg.chat.id, text).reply_markup(kb).await?;
                dialogue.update(Scene::AiCover(state)).await?;
            } else {
                let text = if lang.is_russian() {
                    "📎 Отправьте песню в формате MP3, WAV или OGG"
                } else {
                    "📎 Send a song in MP3, WAV or OGG format"
                };
                bot.send_message(msg.chat.id, text).await?;
            }
        }
        _ => {}
    }
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_ai_cover_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    _state: AiCoverState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let chat_id = match q.chat_id() {
        Some(id) => id,
        None => return Ok(()),
    };
    let tid = q.from.id.0 as i64;
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    match data {
        "ac:back_menu" => {
            return return_to_menu(&bot, &dialogue, chat_id, lang).await;
        }
        "ac:confirm" => {
            if let Err(err_msg) = deduct_balance(&db, tid, AI_COVER_COST, lang).await {
                bot.send_message(chat_id, err_msg).await?;
                return Ok(());
            }

            let text = if lang.is_russian() {
                "⏳ Создаём AI Cover...\n\nЭто займёт 1-3 минуты."
            } else {
                "⏳ Creating AI Cover...\n\nThis will take 1-3 minutes."
            };
            bot.send_message(chat_id, text).await?;
            dialogue.update(Scene::MainMenu).await?;
        }
        "ac:another" => {
            let mut new_state = AiCoverState::default();
            new_state.step = 1;
            let text = if lang.is_russian() { "📎 Отправьте следующую песню:" } else { "📎 Send the next song:" };
            bot.send_message(chat_id, text).await?;
            dialogue.update(Scene::AiCover(new_state)).await?;
        }
        _ => {}
    }
    Ok(())
}
