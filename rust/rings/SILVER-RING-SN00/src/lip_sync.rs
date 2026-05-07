use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, LipSyncState};
use trios_mb_tg::HandlerResult;
use trios_mb_tg::keyboards::main_menu_keyboard;

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

async fn load_lang(db: &Arc<dyn Database>, msg: &Message) -> trios_mb_types::user::Language {
    match msg.from {
        Some(ref user) => db.get_user_by_telegram_id(user.id.0 as i64)
            .await.ok().flatten().map(|u| u.language).unwrap_or_default(),
        None => trios_mb_types::user::Language::default(),
    }
}

async fn load_lang_cb(db: &Arc<dyn Database>, q: &teloxide::types::CallbackQuery) -> trios_mb_types::user::Language {
    db.get_user_by_telegram_id(q.from.id.0 as i64)
        .await.ok().flatten().map(|u| u.language).unwrap_or_default()
}

pub async fn handle_lip_sync_entry(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let text = if lang.is_russian() { "Отправьте видео для LipSync" } else { "Send a video for LipSync" };
    bot.send_message(msg.chat.id, text).await?;
    let mut state = LipSyncState::default();
    state.step = 1;
    dialogue.update(Scene::LipSync(state)).await?;
    Ok(())
}

pub async fn handle_lip_sync_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    mut state: LipSyncState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    if let Some(video) = msg.video() {
        if state.step <= 1 {
            state.video_url = Some(video.file.id.clone());
            state.step = 2;
            let text = if lang.is_russian() { "Отправьте аудио" } else { "Send audio" };
            bot.send_message(msg.chat.id, text).await?;
            dialogue.update(Scene::LipSync(state)).await?;
            return Ok(());
        }
    }

    if let Some(audio) = msg.audio() {
        if state.step == 2 {
            state.audio_url = Some(audio.file.id.clone());
            state.step = 3;

            let kb = InlineKeyboardMarkup::new(vec![
                vec![
                    InlineKeyboardButton::callback("SyncLabs", "ls:synclabs"),
                    InlineKeyboardButton::callback("HeyGen", "ls:heygen"),
                ],
                vec![
                    InlineKeyboardButton::callback("Hedra", "ls:hedra"),
                    InlineKeyboardButton::callback("Fal", "ls:fal"),
                ],
            ]);

            let text = if lang.is_russian() { "Выберите модель:" } else { "Select model:" };
            bot.send_message(msg.chat.id, text).reply_markup(kb).await?;
            dialogue.update(Scene::LipSync(state)).await?;
            return Ok(());
        }
    }

    if let Some(voice) = msg.voice() {
        if state.step == 2 {
            state.audio_url = Some(voice.file.id.clone());
            state.step = 3;

            let kb = InlineKeyboardMarkup::new(vec![
                vec![
                    InlineKeyboardButton::callback("SyncLabs", "ls:synclabs"),
                    InlineKeyboardButton::callback("HeyGen", "ls:heygen"),
                ],
                vec![
                    InlineKeyboardButton::callback("Hedra", "ls:hedra"),
                    InlineKeyboardButton::callback("Fal", "ls:fal"),
                ],
            ]);

            let text = if lang.is_russian() { "Выберите модель:" } else { "Select model:" };
            bot.send_message(msg.chat.id, text).reply_markup(kb).await?;
            dialogue.update(Scene::LipSync(state)).await?;
            return Ok(());
        }
    }

    Ok(())
}

pub async fn handle_lip_sync_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    mut state: LipSyncState,
    q: teloxide::types::CallbackQuery,
) -> HandlerResult {
    bot.answer_callback_query(&q.id).await?;
    let lang = load_lang_cb(&db, &q).await;
    let chat_id = q.chat_id().unwrap();

    let data = match &q.data {
        Some(d) => d.as_str(),
        None => return Ok(()),
    };

    match data {
        "ls:synclabs" | "ls:heygen" | "ls:hedra" | "ls:fal" => {
            let model = match data {
                "ls:synclabs" => "synclabs",
                "ls:heygen" => "heygen",
                "ls:hedra" => "hedra",
                "ls:fal" => "fal",
                _ => "synclabs",
            };
            state.model = Some(model.to_string());
            state.step = 4;
            bot.send_message(chat_id, trios_mb_i18n::t(lang, "processing")).await?;
            dialogue.update(Scene::LipSync(state)).await?;
        }
        "ls:retry" => {
            let text = if lang.is_russian() { "Отправьте видео для LipSync" } else { "Send a video for LipSync" };
            bot.send_message(chat_id, text).await?;
            dialogue.update(Scene::LipSync(LipSyncState::default())).await?;
        }
        "ls:done" => {
            dialogue.update(Scene::MainMenu).await?;
            bot.send_message(chat_id, trios_mb_i18n::t(lang, "main_menu"))
                .reply_markup(main_menu_keyboard(lang))
                .await?;
        }
        _ => {}
    }
    Ok(())
}
