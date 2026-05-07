use teloxide::types::{InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, KeyboardMarkup};
use trios_mb_types::scene::SceneId;
use trios_mb_types::user::Language;
use trios_mb_i18n::t;
use crate::categories::{self, get_category_text, get_item_text};

pub fn main_menu_keyboard(lang: Language) -> KeyboardMarkup {
    let is_ru = lang.is_russian();
    let buttons: Vec<Vec<KeyboardButton>> = categories::CATEGORIES
        .chunks(3)
        .map(|chunk| {
            chunk.iter()
                .map(|cat| KeyboardButton::new(get_category_text(cat, is_ru).to_string()))
                .collect()
        })
        .collect();
    KeyboardMarkup::new(buttons).resize_keyboard()
}

pub fn category_keyboard(lang: Language, category_id: &str, is_admin: bool) -> Option<KeyboardMarkup> {
    let is_ru = lang.is_russian();
    let category = categories::get_category_by_id(category_id)?;

    if category.items.is_empty() {
        return Some(main_menu_keyboard(lang));
    }

    let visible = categories::visible_items(category, is_admin, false);
    let buttons: Vec<String> = visible.iter()
        .map(|item| get_item_text(item, is_ru).to_string())
        .collect();

    let rows: Vec<Vec<KeyboardButton>> = buttons
        .chunks(2)
        .map(|chunk| {
            chunk.iter().map(|t| KeyboardButton::new(t.clone())).collect()
        })
        .chain(std::iter::once(vec![
            KeyboardButton::new(t(lang, "main_menu")),
        ]))
        .collect();

    Some(KeyboardMarkup::new(rows).resize_keyboard())
}

pub fn back_button(lang: Language) -> InlineKeyboardButton {
    InlineKeyboardButton::callback(t(lang, "back"), "nav:back")
}

pub fn cancel_button(lang: Language) -> InlineKeyboardButton {
    InlineKeyboardButton::callback(t(lang, "cancel"), "nav:cancel")
}

pub fn nav_button(text: impl Into<String>, scene: SceneId) -> InlineKeyboardButton {
    InlineKeyboardButton::callback(text.into(), format!("nav:{}", scene.scene_name()))
}

pub fn inline_single(text: impl Into<String>, callback_data: impl Into<String>) -> InlineKeyboardMarkup {
    InlineKeyboardMarkup::new(vec![vec![
        InlineKeyboardButton::callback(text.into(), callback_data.into()),
    ]])
}

pub fn inline_with_back(buttons: Vec<Vec<InlineKeyboardButton>>, lang: Language) -> InlineKeyboardMarkup {
    let mut rows = buttons;
    rows.push(vec![back_button(lang), cancel_button(lang)]);
    InlineKeyboardMarkup::new(rows)
}

pub fn main_menu_inline(lang: Language) -> InlineKeyboardMarkup {
    InlineKeyboardMarkup::new(vec![vec![
        InlineKeyboardButton::callback(t(lang, "main_menu"), "nav:cancel"),
    ]])
}

pub fn payment_keyboard(lang: Language) -> InlineKeyboardMarkup {
    let is_ru = lang.is_russian();
    InlineKeyboardMarkup::new(vec![
        vec![
            InlineKeyboardButton::callback(
                if is_ru { "⭐️ Звездами" } else { "⭐️ Stars" }.to_string(),
                "pay_stars",
            ),
            InlineKeyboardButton::callback(
                if is_ru { "💳 Рублями" } else { "💳 Rubles" }.to_string(),
                "pay_rubles",
            ),
        ],
        vec![
            InlineKeyboardButton::callback(
                if is_ru { "💎 Криптой" } else { "💎 Crypto" }.to_string(),
                "pay_crypto",
            ),
        ],
        vec![cancel_button(lang)],
    ])
}

pub fn step_selection_keyboard(lang: Language) -> KeyboardMarkup {
    let is_ru = lang.is_russian();
    let steps = if is_ru {
        vec![
            vec!["100 шагов", "200 шагов", "300 шагов"],
            vec!["400 шагов", "500 шагов", "600 шагов"],
            vec!["700 шагов", "800 шагов", "1000 шагов"],
            vec!["Справка по команде", "Отмена"],
        ]
    } else {
        vec![
            vec!["100 steps", "200 steps", "300 steps"],
            vec!["400 steps", "500 steps", "600 steps"],
            vec!["700 steps", "800 steps", "1000 steps"],
            vec!["Help for the command", "Cancel"],
        ]
    };
    let buttons: Vec<Vec<KeyboardButton>> = steps
        .into_iter()
        .map(|row| row.into_iter().map(KeyboardButton::new).collect())
        .collect();
    KeyboardMarkup::new(buttons).resize_keyboard()
}

pub fn model_selection_keyboard(models: &[(String, String)]) -> InlineKeyboardMarkup {
    let rows: Vec<Vec<InlineKeyboardButton>> = models
        .chunks(2)
        .map(|chunk| {
            chunk.iter()
                .map(|(name, id)| InlineKeyboardButton::callback(name.clone(), id.clone()))
                .collect()
        })
        .collect();
    InlineKeyboardMarkup::new(rows)
}

pub fn generate_image_keyboard(lang: Language) -> InlineKeyboardMarkup {
    let is_ru = lang.is_russian();
    InlineKeyboardMarkup::new(vec![vec![
        InlineKeyboardButton::callback(
            if is_ru { "Сгенерировать" } else { "Generate" }.to_string(),
            "generate_image",
        ),
        InlineKeyboardButton::callback(
            t(lang, "cancel"),
            "nav:cancel",
        ),
    ]])
}

pub fn help_cancel_keyboard(lang: Language) -> InlineKeyboardMarkup {
    let is_ru = lang.is_russian();
    InlineKeyboardMarkup::new(vec![vec![
        InlineKeyboardButton::callback(
            if is_ru { "❓ Помощь" } else { "❓ Help" }.to_string(),
            "nav:cancel",
        ),
        InlineKeyboardButton::callback(
            t(lang, "cancel"),
            "nav:cancel",
        ),
    ]])
}
