use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::prelude::*;
use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup};
use trios_mb_traits::Database;
use trios_mb_tg::state::{Scene, TextToVideoState};
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

pub async fn handle_text_to_video_entry(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let text = if lang.is_russian() { "Введите описание видео:" } else { "Enter video description:" };
    bot.send_message(msg.chat.id, text).await?;
    let mut state = TextToVideoState::default();
    state.step = 1;
    dialogue.update(Scene::TextToVideo(state)).await?;
    Ok(())
}

pub async fn handle_text_to_video_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    mut state: TextToVideoState,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    let text = match msg.text() {
        Some(t) => t,
        None => return Ok(()),
    };

    if state.step == 1 {
        state.prompt = Some(text.to_string());
        state.step = 2;

        let kb = InlineKeyboardMarkup::new(vec![
            vec![
                InlineKeyboardButton::callback("Kling 1.6", "tv:kling"),
                InlineKeyboardButton::callback("Runway Gen-3", "tv:runway"),
            ],
            vec![
                InlineKeyboardButton::callback("Sora", "tv:sora"),
                InlineKeyboardButton::callback("Luma Dream Machine", "tv:luma"),
            ],
        ]);

        let model_text = if lang.is_russian() { "Выберите модель:" } else { "Select model:" };
        bot.send_message(msg.chat.id, model_text).reply_markup(kb).await?;
        dialogue.update(Scene::TextToVideo(state)).await?;
    }
    Ok(())
}

pub async fn handle_text_to_video_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    mut state: TextToVideoState,
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
        "tv:kling" | "tv:runway" | "tv:sora" | "tv:luma" => {
            let model = match data {
                "tv:kling" => "kling-1.6",
                "tv:runway" => "runway-gen3",
                "tv:sora" => "sora",
                "tv:luma" => "luma-dream-machine",
                _ => "kling-1.6",
            };
            state.model = Some(model.to_string());
            state.step = 3;

            let kb = InlineKeyboardMarkup::new(vec![
                vec![
                    InlineKeyboardButton::callback("5s", "tv:dur_5"),
                    InlineKeyboardButton::callback("10s", "tv:dur_10"),
                ],
            ]);

            let dur_text = if lang.is_russian() { "Выберите длительность:" } else { "Select duration:" };
            bot.send_message(chat_id, dur_text).reply_markup(kb).await?;
            dialogue.update(Scene::TextToVideo(state)).await?;
        }
        "tv:dur_5" | "tv:dur_10" => {
            let dur = match data {
                "tv:dur_5" => 5,
                "tv:dur_10" => 10,
                _ => 5,
            };
            state.duration = Some(dur);
            state.step = 4;
            bot.send_message(chat_id, trios_mb_i18n::t(lang, "processing")).await?;
            dialogue.update(Scene::TextToVideo(state)).await?;
        }
        "tv:retry" => {
            let text = if lang.is_russian() { "Введите описание видео:" } else { "Enter video description:" };
            bot.send_message(chat_id, text).await?;
            dialogue.update(Scene::TextToVideo(TextToVideoState::default())).await?;
        }
        "tv:done" => {
            dialogue.update(Scene::MainMenu).await?;
            bot.send_message(chat_id, trios_mb_i18n::t(lang, "main_menu"))
                .reply_markup(main_menu_keyboard(lang))
                .await?;
        }
        _ => {}
    }
    Ok(())
}
