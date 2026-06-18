use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, VoiceTrainingState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::answer_callback_query_timeout;
use crate::generation_utils::{load_lang, load_lang_cb, return_to_menu, deduct_balance};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const VOICE_TRAINING_COST: f64 = 15.0;

#[tracing::instrument(skip_all)]
pub async fn handle_voice_training_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    mut state: VoiceTrainingState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    match state.step {
        0 => {
            let text = if lang.is_russian() {
                "🎤 Обучение голоса для AI Cover\n\nЗагрузите аудио с вашим голосом (30 сек - 3 мин).\n\nФорматы: MP3, WAV, OGG, M4A, FLAC\n💰 Стоимость: 15⭐\n⏱️ Время: 5-10 минут"
            } else {
                "🎤 Voice Training for AI Cover\n\nUpload audio with your voice (30 sec - 3 min).\n\nFormats: MP3, WAV, OGG, M4A, FLAC\n💰 Cost: 15⭐\n⏱️ Time: 5-10 minutes"
            };
            bot.send_message(msg.chat.id, text)
                .reply_markup(InlineKeyboardMarkup::new(vec![
                    vec![InlineKeyboardButton::callback(
                        if lang.is_russian() { "🏠 В меню" } else { "🏠 To menu" },
                        "vt:back_menu",
                    )],
                ]))
                .await?;
            state.step = 1;
            dialogue.update(Scene::VoiceTraining(state)).await?;
        }
        1 => {
            let file_id = if let Some(audio) = msg.audio() {
                Some(audio.file.id.clone())
            } else { msg.voice().map(|voice| voice.file.id.clone()) };

            if let Some(fid) = file_id {
                state.audio_url = Some(fid);
                state.step = 2;

                let kb = InlineKeyboardMarkup::new(vec![
                    vec![InlineKeyboardButton::callback(
                        if lang.is_russian() { "✅ Начать обучение (15⭐)" } else { "✅ Start training (15⭐)" },
                        "vt:confirm",
                    )],
                    vec![InlineKeyboardButton::callback(
                        if lang.is_russian() { "❌ Отмена" } else { "❌ Cancel" },
                        "vt:back_menu",
                    )],
                ]);
                let text = if lang.is_russian() {
                    "✅ Аудио принято!\n\nПодтвердите начало обучения:"
                } else {
                    "✅ Audio accepted!\n\nConfirm training start:"
                };
                bot.send_message(msg.chat.id, text).reply_markup(kb).await?;
                dialogue.update(Scene::VoiceTraining(state)).await?;
            } else {
                let text = if lang.is_russian() {
                    "📎 Отправьте аудиофайл или голосовое сообщение"
                } else {
                    "📎 Send an audio file or voice message"
                };
                bot.send_message(msg.chat.id, text).await?;
            }
        }
        _ => {}
    }
    Ok(())
}

#[tracing::instrument(skip_all)]
pub async fn handle_voice_training_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    state: VoiceTrainingState,
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
        tracing::warn!("Callback query missing valid telegram_id; aborting voice_training handler");
        return Ok(());
    }
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    match data {
        "vt:back_menu" => {
            return return_to_menu(&bot, &dialogue, chat_id, lang).await;
        }
        "vt:confirm" => {
            if state.audio_url.is_none() || state.audio_url.as_ref().map(|s| s.is_empty()).unwrap_or(true) {
                let text = "❌ Please send an audio file first.";
                bot.send_message(chat_id, text).await?;
                return Ok(());
            }

            if let Err(err_msg) = deduct_balance(&db, tid, VOICE_TRAINING_COST, lang).await {
                bot.send_message(chat_id, err_msg).await?;
                return Ok(());
            }

            let text = if lang.is_russian() {
                "✅ Обучение голоса запущено!\n\n⏱️ Это займёт 5-10 минут.\n📬 Вы получите уведомление, когда модель будет готова."
            } else {
                "✅ Voice training started!\n\n⏱️ This will take 5-10 minutes.\n📬 You will be notified when the model is ready."
            };
            bot.send_message(chat_id, text).await?;
            dialogue.update(Scene::MainMenu).await?;
        }
        _ => {}
    }
    Ok(())
}
