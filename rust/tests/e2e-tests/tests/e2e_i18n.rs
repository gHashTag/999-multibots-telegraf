use trios_mb_i18n::{t, t_or};
use trios_mb_types::user::Language;

#[test]
fn t_returns_russian_strings() {
    assert_eq!(t(Language::Ru, "nav_main_menu"), "🏠 Главное меню");
    assert_eq!(t(Language::Ru, "nav_help"), "❓ Справка");
    assert_eq!(t(Language::Ru, "nav_back"), "◀️ Назад");
    assert_eq!(t(Language::Ru, "nav_cancel"), "Отмена");
    assert_eq!(t(Language::Ru, "btn_balance"), "💰 Баланс");
    assert_eq!(t(Language::Ru, "insufficient_balance"), "Недостаточно средств на балансе");
    assert_eq!(t(Language::Ru, "error_occurred"), "❌ Произошла ошибка. Попробуйте позже.");
    assert_eq!(t(Language::Ru, "processing"), "⏳ Обрабатываю...");
    assert_eq!(t(Language::Ru, "cancelled_short"), "❌ Процесс отменён.");
}

#[test]
fn t_returns_english_strings() {
    assert_eq!(t(Language::En, "nav_main_menu"), "🏠 Main menu");
    assert_eq!(t(Language::En, "nav_help"), "❓ Help");
    assert_eq!(t(Language::En, "nav_back"), "◀️ Back");
    assert_eq!(t(Language::En, "nav_cancel"), "Cancel");
    assert_eq!(t(Language::En, "btn_balance"), "💰 Balance");
    assert_eq!(t(Language::En, "insufficient_balance"), "Insufficient balance");
    assert_eq!(t(Language::En, "error_occurred"), "❌ An error occurred. Please try again later.");
    assert_eq!(t(Language::En, "processing"), "⏳ Processing...");
}

#[test]
fn t_missing_key_returns_key_lang_format() {
    let result = t(Language::Ru, "nonexistent_key");
    assert_eq!(result, "nonexistent_key:ru");

    let result = t(Language::En, "nonexistent_key");
    assert_eq!(result, "nonexistent_key:en");
}

#[test]
fn t_or_returns_fallback_for_missing_key() {
    let result = t_or(Language::Ru, "nonexistent_key", "Fallback Value");
    assert_eq!(result, "Fallback Value");
}

#[test]
fn t_or_returns_translated_value_for_existing_key() {
    let result = t_or(Language::Ru, "nav_main_menu", "Fallback");
    assert_eq!(result, "🏠 Главное меню");

    let result = t_or(Language::En, "nav_main_menu", "Fallback");
    assert_eq!(result, "🏠 Main menu");
}

#[test]
fn t_or_empty_fallback() {
    let result = t_or(Language::En, "nonexistent", "");
    assert_eq!(result, "");
}
