use trios_mb_types::scene::SceneId;

#[derive(Debug, Clone, Copy)]
pub struct NavigationItem {
    pub id: &'static str,
    pub ru: &'static str,
    pub en: &'static str,
    pub scene_id: SceneId,
    pub requires_subscription: bool,
    pub admin_only: bool,
    pub owner_only: bool,
    pub direct_scene: bool,
    pub hidden: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct CategoryConfig {
    pub id: &'static str,
    pub ru: &'static str,
    pub en: &'static str,
    pub scene_id: SceneId,
    pub items: &'static [NavigationItem],
}

pub fn get_category_text(cat: &CategoryConfig, is_ru: bool) -> &'static str {
    if is_ru { cat.ru } else { cat.en }
}

pub fn get_item_text(item: &NavigationItem, is_ru: bool) -> &'static str {
    if is_ru { item.ru } else { item.en }
}

static PHOTO_ITEMS: &[NavigationItem] = &[
    NavigationItem {
        id: "neuro_photo",
        ru: "📸 Нейрофото",
        en: "📸 NeuroPhoto",
        scene_id: SceneId::NeuroPhoto,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
    NavigationItem {
        id: "text_to_image",
        ru: "🖼️ Текст в фото",
        en: "🖼️ Text to Photo",
        scene_id: SceneId::TextToImage,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
    NavigationItem {
        id: "image_to_prompt",
        ru: "🔍 Промпт из фото",
        en: "🔍 Prompt from Photo",
        scene_id: SceneId::ImageToPrompt,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
    NavigationItem {
        id: "ai_photoshop",
        ru: "🎨 ИИ Фотошоп",
        en: "🎨 AI Photoshop",
        scene_id: SceneId::AiPhotoshop,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: true,
        hidden: false,
    },
    NavigationItem {
        id: "image_upscaler",
        ru: "⬆️ Увеличить качество",
        en: "⬆️ Upscale Quality",
        scene_id: SceneId::ImageUpscaler,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
    NavigationItem {
        id: "face_swap",
        ru: "🎭 Замена лица",
        en: "🎭 Face Swap",
        scene_id: SceneId::FaceSwap,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
    NavigationItem {
        id: "ai_heroes",
        ru: "🦸\u{200d}♂️ ИИ Герои",
        en: "🦸\u{200d}♂️ AI Heroes",
        scene_id: SceneId::AvatarTransform,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
];

static VIDEO_ITEMS: &[NavigationItem] = &[
    NavigationItem {
        id: "text_to_video",
        ru: "🎥 Видео из текста",
        en: "🎥 Text to Video",
        scene_id: SceneId::TextToVideo,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
    NavigationItem {
        id: "image_to_video",
        ru: "🎥 Фото в видео",
        en: "🎥 Photo to Video",
        scene_id: SceneId::ImageToVideo,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
    NavigationItem {
        id: "morphing",
        ru: "🌀 Infinity Морфинг",
        en: "🌀 Infinity Morphing",
        scene_id: SceneId::Morphing,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
    NavigationItem {
        id: "ai_reels",
        ru: "🎬 ИИ Рилс",
        en: "🎬 AI Reels",
        scene_id: SceneId::AiReels,
        requires_subscription: true,
        admin_only: true,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
    NavigationItem {
        id: "lip_sync",
        ru: "🎤 Синхронизация губ",
        en: "🎤 Lip Sync",
        scene_id: SceneId::LipSync,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: true,
        hidden: false,
    },
];

static AUDIO_ITEMS: &[NavigationItem] = &[
    NavigationItem {
        id: "voice_avatar",
        ru: "🎤 Голос аватара",
        en: "🎤 Avatar Voice",
        scene_id: SceneId::VoiceAvatar,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
    NavigationItem {
        id: "text_to_speech",
        ru: "🎙️ Текст в голос",
        en: "🎙️ Text to Speech",
        scene_id: SceneId::TextToSpeech,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
    NavigationItem {
        id: "video_transcription",
        ru: "📺 Транскрибация",
        en: "📺 Transcription",
        scene_id: SceneId::VideoTranscription,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
    NavigationItem {
        id: "music_generation",
        ru: "🎵 Генерация музыки",
        en: "🎵 Music Generation",
        scene_id: SceneId::MusicGeneration,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
    NavigationItem {
        id: "voice_training",
        ru: "🎤 Обучить голос",
        en: "🎤 Train Voice",
        scene_id: SceneId::VoiceTraining,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: true,
        hidden: false,
    },
    NavigationItem {
        id: "ai_cover",
        ru: "🎧 AI Cover",
        en: "🎧 AI Cover",
        scene_id: SceneId::AiCover,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: true,
        hidden: false,
    },
];

static AVATARS_ITEMS: &[NavigationItem] = &[
    NavigationItem {
        id: "digital_body",
        ru: "🤖 Цифровое тело",
        en: "🤖 Digital Body",
        scene_id: SceneId::DigitalAvatarBody,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
    NavigationItem {
        id: "avatar_brain",
        ru: "🧠 Мозг аватара",
        en: "🧠 Avatar Brain",
        scene_id: SceneId::AvatarBrain,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
    NavigationItem {
        id: "chat_with_avatar",
        ru: "💭 Чат с аватаром",
        en: "💭 Chat with Avatar",
        scene_id: SceneId::ChatWithAvatar,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
    NavigationItem {
        id: "select_model",
        ru: "🤖 Язык аватара",
        en: "🤖 Avatar Language",
        scene_id: SceneId::SelectModel,
        requires_subscription: true,
        admin_only: false,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
];

static PROFILE_ITEMS: &[NavigationItem] = &[
    NavigationItem {
        id: "balance",
        ru: "💰 Баланс",
        en: "💰 Balance",
        scene_id: SceneId::Balance,
        requires_subscription: false,
        admin_only: false,
        owner_only: false,
        direct_scene: true,
        hidden: false,
    },
    NavigationItem {
        id: "top_up",
        ru: "💎 Пополнить баланс",
        en: "💎 Top up Balance",
        scene_id: SceneId::Payment,
        requires_subscription: false,
        admin_only: false,
        owner_only: false,
        direct_scene: true,
        hidden: false,
    },
    NavigationItem {
        id: "subscription",
        ru: "💫 Оформить подписку",
        en: "💫 Subscribe",
        scene_id: SceneId::Subscription,
        requires_subscription: false,
        admin_only: false,
        owner_only: false,
        direct_scene: true,
        hidden: true,
    },
    NavigationItem {
        id: "invite",
        ru: "👥 Пригласить друга",
        en: "👥 Invite Friend",
        scene_id: SceneId::Invite,
        requires_subscription: false,
        admin_only: false,
        owner_only: false,
        direct_scene: true,
        hidden: false,
    },
    NavigationItem {
        id: "support",
        ru: "💬 Техподдержка",
        en: "💬 Tech Support",
        scene_id: SceneId::TechSupport,
        requires_subscription: false,
        admin_only: false,
        owner_only: false,
        direct_scene: true,
        hidden: false,
    },
    NavigationItem {
        id: "language",
        ru: "🌐 Язык",
        en: "🌐 Language",
        scene_id: SceneId::ChangeLanguage,
        requires_subscription: false,
        admin_only: false,
        owner_only: false,
        direct_scene: true,
        hidden: false,
    },
    NavigationItem {
        id: "instagram_parsing",
        ru: "🔍 Парсинг Instagram",
        en: "🔍 Instagram Parsing",
        scene_id: SceneId::InstagramScraping,
        requires_subscription: false,
        admin_only: true,
        owner_only: false,
        direct_scene: false,
        hidden: false,
    },
];

pub static CATEGORIES: &[CategoryConfig] = &[
    CategoryConfig {
        id: "photo",
        ru: "📸 Фото",
        en: "📸 Photo",
        scene_id: SceneId::Menu,
        items: PHOTO_ITEMS,
    },
    CategoryConfig {
        id: "video",
        ru: "🎥 Видео",
        en: "🎥 Video",
        scene_id: SceneId::Menu,
        items: VIDEO_ITEMS,
    },
    CategoryConfig {
        id: "audio",
        ru: "🎙️ Аудио",
        en: "🎙️ Audio",
        scene_id: SceneId::Menu,
        items: AUDIO_ITEMS,
    },
    CategoryConfig {
        id: "avatars",
        ru: "🤖 Аватары",
        en: "🤖 Avatars",
        scene_id: SceneId::Menu,
        items: AVATARS_ITEMS,
    },
    CategoryConfig {
        id: "top_up",
        ru: "💎 Пополнить",
        en: "💎 Top up",
        scene_id: SceneId::Payment,
        items: &[],
    },
    CategoryConfig {
        id: "profile",
        ru: "👤 Профиль",
        en: "👤 Profile",
        scene_id: SceneId::Menu,
        items: PROFILE_ITEMS,
    },
];

pub fn get_category_by_id(id: &str) -> Option<&'static CategoryConfig> {
    CATEGORIES.iter().find(|c| c.id == id)
}

pub fn get_item_by_id(id: &str) -> Option<&'static NavigationItem> {
    for cat in CATEGORIES {
        if let Some(item) = cat.items.iter().find(|i| i.id == id) {
            return Some(item);
        }
    }
    None
}

pub fn visible_items(category: &CategoryConfig, is_admin: bool, is_owner: bool) -> Vec<&NavigationItem> {
    category
        .items
        .iter()
        .filter(|item| {
            if item.hidden {
                return false;
            }
            if item.admin_only && !is_admin {
                return false;
            }
            if item.owner_only && !is_owner && !is_admin {
                return false;
            }
            true
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn six_categories() {
        assert_eq!(CATEGORIES.len(), 6);
    }

    #[test]
    fn category_ids() {
        let ids: Vec<&str> = CATEGORIES.iter().map(|c| c.id).collect();
        assert_eq!(ids, vec!["photo", "video", "audio", "avatars", "top_up", "profile"]);
    }

    #[test]
    fn photo_has_seven_items() {
        assert_eq!(PHOTO_ITEMS.len(), 7);
    }

    #[test]
    fn video_has_five_items() {
        assert_eq!(VIDEO_ITEMS.len(), 5);
    }

    #[test]
    fn audio_has_six_items() {
        assert_eq!(AUDIO_ITEMS.len(), 6);
    }

    #[test]
    fn avatars_has_four_items() {
        assert_eq!(AVATARS_ITEMS.len(), 4);
    }

    #[test]
    fn top_up_has_no_items() {
        let cat = get_category_by_id("top_up").unwrap();
        assert!(cat.items.is_empty());
    }

    #[test]
    fn get_category_by_id_found() {
        assert!(get_category_by_id("photo").is_some());
        assert!(get_category_by_id("profile").is_some());
    }

    #[test]
    fn get_category_by_id_not_found() {
        assert!(get_category_by_id("nonexistent").is_none());
    }

    #[test]
    fn get_item_by_id_found() {
        assert!(get_item_by_id("neuro_photo").is_some());
        assert!(get_item_by_id("balance").is_some());
    }

    #[test]
    fn get_item_by_id_not_found() {
        assert!(get_item_by_id("nonexistent").is_none());
    }

    #[test]
    fn item_scene_ids_valid() {
        for cat in CATEGORIES {
            for item in cat.items {
                let name = item.scene_id.scene_name();
                assert!(!name.is_empty());
            }
        }
    }

    #[test]
    fn visible_items_filters_hidden() {
        let profile = get_category_by_id("profile").unwrap();
        let visible = visible_items(profile, false, false);
        assert!(visible.iter().all(|i| !i.hidden));
    }

    #[test]
    fn visible_items_filters_admin() {
        let profile = get_category_by_id("profile").unwrap();
        let visible_user = visible_items(profile, false, false);
        let visible_admin = visible_items(profile, true, false);
        assert!(visible_admin.len() >= visible_user.len());
    }

    #[test]
    fn get_category_text_ru() {
        let cat = get_category_by_id("photo").unwrap();
        assert_eq!(get_category_text(cat, true), "📸 Фото");
    }

    #[test]
    fn get_category_text_en() {
        let cat = get_category_by_id("photo").unwrap();
        assert_eq!(get_category_text(cat, false), "📸 Photo");
    }

    #[test]
    fn get_item_text_ru() {
        let item = get_item_by_id("neuro_photo").unwrap();
        assert_eq!(get_item_text(item, true), "📸 Нейрофото");
    }

    #[test]
    fn get_item_text_en() {
        let item = get_item_by_id("neuro_photo").unwrap();
        assert_eq!(get_item_text(item, false), "📸 NeuroPhoto");
    }
}
