use trios_mb_types::user::Language;

pub fn detect_language(text: &str) -> Language {
    let has_cyrillic = text.chars().any(|c| {
        ('\u{0400}'..='\u{04FF}').contains(&c)
    });
    if has_cyrillic { Language::Ru } else { Language::En }
}
