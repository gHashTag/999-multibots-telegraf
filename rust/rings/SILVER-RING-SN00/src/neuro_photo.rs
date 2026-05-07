use std::sync::Arc;
use teloxide::dispatching::dialogue::GetChatId;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage};
use teloxide::prelude::*;
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, NeuroPhotoState};
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

pub async fn handle_neuro_photo_entry(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    bot.send_message(msg.chat.id, trios_mb_i18n::t(lang, "send_photo")).await?;
    let mut state = NeuroPhotoState::default();
    state.step = 1;
    dialogue.update(Scene::NeuroPhoto(state)).await?;
    Ok(())
}

pub async fn handle_neuro_photo_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    state: NeuroPhotoState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;

    if let Some(photos) = msg.photo() {
        if state.step <= 1 {
            let file_id = photos.last().map(|p| p.file.id.clone()).unwrap_or_default();
            let mut new_state = state;
            new_state.image_url = Some(file_id);
            new_state.step = 2;
            bot.send_message(msg.chat.id, trios_mb_i18n::t(lang, "send_text")).await?;
            dialogue.update(Scene::NeuroPhoto(new_state)).await?;
            return Ok(());
        }
    }

    if let Some(text) = msg.text() {
        if state.step == 2 && state.image_url.is_some() {
            let mut new_state = state;
            new_state.prompt = Some(text.to_string());
            new_state.step = 3;
            bot.send_message(msg.chat.id, trios_mb_i18n::t(lang, "processing")).await?;
            dialogue.update(Scene::NeuroPhoto(new_state)).await?;
            return Ok(());
        }
    }

    if state.step == 0 {
        bot.send_message(msg.chat.id, trios_mb_i18n::t(lang, "send_photo")).await?;
        let mut new_state = state;
        new_state.step = 1;
        dialogue.update(Scene::NeuroPhoto(new_state)).await?;
    }
    Ok(())
}

pub async fn handle_neuro_photo_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    state: NeuroPhotoState,
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
        "np:male" | "np:female" => {
            let gender = if data == "np:male" { "male" } else { "female" };
            let mut new_state = state;
            new_state.gender = Some(gender.to_string());
            new_state.step = 3;
            bot.send_message(chat_id, trios_mb_i18n::t(lang, "processing")).await?;
            dialogue.update(Scene::NeuroPhoto(new_state)).await?;
        }
        "np:retry" => {
            bot.send_message(chat_id, trios_mb_i18n::t(lang, "send_photo")).await?;
            dialogue.update(Scene::NeuroPhoto(NeuroPhotoState::default())).await?;
        }
        "np:done" => {
            dialogue.update(Scene::MainMenu).await?;
            bot.send_message(chat_id, trios_mb_i18n::t(lang, "main_menu"))
                .reply_markup(main_menu_keyboard(lang))
                .await?;
        }
        _ => {}
    }
    Ok(())
}
