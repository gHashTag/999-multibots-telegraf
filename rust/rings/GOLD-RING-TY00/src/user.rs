use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[derive(Default)]
pub enum Language {
    #[serde(rename = "ru")]
    #[default]
    Ru,
    #[serde(rename = "en")]
    En,
}


impl Language {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Ru => "ru",
            Self::En => "en",
        }
    }

    pub fn from_code(code: &str) -> Option<Self> {
        match code.to_lowercase().as_str() {
            "ru" | "rus" | "russian" => Some(Self::Ru),
            "en" | "eng" | "english" => Some(Self::En),
            _ => None,
        }
    }

    pub fn is_russian(&self) -> bool {
        matches!(self, Self::Ru)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub enum Gender {
    Male,
    Female,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub enum SubscriptionType {
    NeuroPhoto,
    NeuroVideo,
    Stars,
    NeuroTester,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct User {
    pub id: uuid::Uuid,
    pub telegram_id: i64,
    pub username: Option<String>,
    pub language: Language,
    pub gender: Option<Gender>,
    pub level: i32,
    pub balance: f64,
    pub voice: Option<String>,
    pub model: Option<String>,
    pub subscription: Option<SubscriptionType>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UserBalance {
    pub telegram_id: i64,
    pub amount: f64,
    pub currency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UserStats {
    pub telegram_id: i64,
    pub generated_images: i64,
    pub total_payments: i64,
    pub referral_count: i64,
    pub level: i32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn language_code() {
        assert_eq!(Language::Ru.code(), "ru");
        assert_eq!(Language::En.code(), "en");
    }

    #[test]
    fn language_from_code() {
        assert_eq!(Language::from_code("ru"), Some(Language::Ru));
        assert_eq!(Language::from_code("en"), Some(Language::En));
        assert_eq!(Language::from_code("rus"), Some(Language::Ru));
        assert_eq!(Language::from_code("eng"), Some(Language::En));
        assert_eq!(Language::from_code("russian"), Some(Language::Ru));
        assert_eq!(Language::from_code("english"), Some(Language::En));
        assert_eq!(Language::from_code("RU"), Some(Language::Ru));
        assert_eq!(Language::from_code("EN"), Some(Language::En));
        assert_eq!(Language::from_code("xx"), None);
        assert_eq!(Language::from_code(""), None);
    }

    #[test]
    fn language_is_russian() {
        assert!(Language::Ru.is_russian());
        assert!(!Language::En.is_russian());
    }

    #[test]
    fn language_default_is_ru() {
        assert_eq!(Language::default(), Language::Ru);
    }

    #[test]
    fn language_equality() {
        assert_eq!(Language::Ru, Language::Ru);
        assert_ne!(Language::Ru, Language::En);
    }

    #[test]
    fn language_serialization() {
        let json = serde_json::to_string(&Language::Ru).unwrap();
        assert_eq!(json, "\"ru\"");
        let json = serde_json::to_string(&Language::En).unwrap();
        assert_eq!(json, "\"en\"");
    }

    #[test]
    fn language_deserialization() {
        let lang: Language = serde_json::from_str("\"ru\"").unwrap();
        assert_eq!(lang, Language::Ru);
        let lang: Language = serde_json::from_str("\"en\"").unwrap();
        assert_eq!(lang, Language::En);
    }

    #[test]
    fn gender_variants() {
        assert_ne!(Gender::Male, Gender::Female);
        assert_ne!(Gender::Female, Gender::Other);
    }

    #[test]
    fn subscription_type_variants() {
        assert_ne!(SubscriptionType::NeuroPhoto, SubscriptionType::NeuroVideo);
        assert_ne!(SubscriptionType::Stars, SubscriptionType::NeuroTester);
    }
}
