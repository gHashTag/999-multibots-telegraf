use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, TextToSpeechState};
use trios_mb_tg::HandlerResult;
use crate::generation_utils::{load_lang, load_lang_cb, return_to_menu, check_balance, deduct_balance};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

const TTS_COST: f64 = 3.0;

pub async fn handle_text_to_speech_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    mut state: TextToSpeechState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let tid = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);

    if state.step == 0 {
        let text = if lang.is_russian() {
            "🎙️ Отправьте текст для преобразования в голос"
        } else {
            "🎙️ Send text to convert to voice"
        };
        bot.send_message(msg.chat.id, text)
            .reply_markup(crate::generation_utils::back_cancel_keyboard(lang))
            .await?;
        state.step = 1;
        dialogue.update(Scene::TextToSpeech(state)).await?;
        return Ok(());
    }

    if state.step == 1 {
        if let Some(text) = msg.text() {
            if text.trim().is_empty() {
                let err = if lang.is_russian() { "✍️ Пожалуйста, отправьте текст" } else { "✍️ Please send text" };
                bot.send_message(msg.chat.id, err).await?;
                return Ok(());
            }

            if let Err(err_msg) = check_balance(&db, tid, TTS_COST, lang).await {
                bot.send_message(msg.chat.id, err_msg).await?;
                return return_to_menu(&bot, &dialogue, msg.chat.id, lang).await;
            }

            state.text = Some(text.to_string());
            state.model = Some("elevenlabs".to_string());
            state.step = 2;

            let processing = if lang.is_russian() {
                "⏳ Генерирую аудио..."
            } else {
                "⏳ Generating audio..."
            };
            bot.send_message(msg.chat.id, processing).await?;

            let _ = deduct_balance(&db, tid, TTS_COST).await;

            dialogue.update(Scene::TextToSpeech(state)).await?;
        } else {
            let err = if lang.is_russian() { "✍️ Пожалуйста, отправьте текст" } else { "✍️ Please send text" };
            bot.send_message(msg.chat.id, err).await?;
        }
    }

    Ok(())
}

pub async fn handle_text_to_speech_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    _state: TextToSpeechState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let data = match &q.data { Some(d) => d.as_str(), None => return Ok(()) };

    if data == "tts:cancel" {
        return return_to_menu(&bot, &dialogue, q.chat_id().unwrap(), lang).await;
    }
    Ok(())
}
