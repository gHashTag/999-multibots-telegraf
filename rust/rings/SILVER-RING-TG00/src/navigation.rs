use trios_mb_types::scene::SceneId;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use crate::categories::{self, CategoryConfig, NavigationItem};

const MAX_HISTORY_DEPTH: usize = 5;
const STUCK_THRESHOLD: usize = 3;
const FORCE_RESET_THRESHOLD: usize = 5;
const INACTIVE_EVICTION_THRESHOLD: Duration = Duration::from_secs(24 * 60 * 60); // 24 hours
const EVICTION_INTERVAL: usize = 1000; // evict every N enter() calls

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NavigationAction {
    Navigate(SceneId),
    Back,
    Cancel,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NavigationEvent {
    SceneEnter,
    SceneLeave,
    AccessDenied,
    TransitionBlocked,
    Error,
}

#[derive(Debug, Clone)]
pub struct NavigationResult {
    pub success: bool,
    pub scene_id: Option<SceneId>,
    pub error: Option<String>,
    pub event: Option<NavigationEvent>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ButtonMatch {
    Navigation(NavigationAction),
    Category(&'static str),
    Scene(SceneId),
}

pub struct NavigationRouter {
    history: HashMap<i64, Vec<SceneId>>,
    last_accessed: HashMap<i64, Instant>,
    enter_count: usize,
}

impl Default for NavigationRouter {
    fn default() -> Self {
        Self::new()
    }
}

impl NavigationRouter {
    pub fn new() -> Self {
        Self {
            history: HashMap::new(),
            last_accessed: HashMap::new(),
            enter_count: 0,
        }
    }

    pub fn current_scene(&self, chat_id: i64) -> Option<SceneId> {
        self.history.get(&chat_id).and_then(|h| h.last().copied())
    }

    pub fn enter(&mut self, chat_id: i64, scene: SceneId) {
        let now = Instant::now();
        self.last_accessed.insert(chat_id, now);

        let history = self.history.entry(chat_id).or_default();
        if history.last() != Some(&scene) {
            history.push(scene);
        }
        if history.len() > MAX_HISTORY_DEPTH {
            let drain_count = history.len() - MAX_HISTORY_DEPTH;
            history.drain(0..drain_count);
        }

        self.enter_count += 1;
        if self.enter_count % EVICTION_INTERVAL == 0 {
            self.evict_inactive(INACTIVE_EVICTION_THRESHOLD);
        }
    }

    /// Remove chat histories that have been idle longer than `threshold`.
    /// Call periodically (e.g., every N enter() calls or from a background task).
    pub fn evict_inactive(&mut self, threshold: Duration) {
        let now = Instant::now();
        let mut to_remove = Vec::new();
        for (&chat_id, &last) in &self.last_accessed {
            if now.duration_since(last) > threshold {
                to_remove.push(chat_id);
            }
        }
        let evicted_count = to_remove.len();
        for chat_id in to_remove {
            self.history.remove(&chat_id);
            self.last_accessed.remove(&chat_id);
        }
        if evicted_count > 0 {
            tracing::info!(
                evicted = evicted_count,
                remaining = self.history.len(),
                "NavigationRouter evicted inactive chats"
            );
        }
    }

    pub fn go_back(&mut self, chat_id: i64) -> Option<SceneId> {
        self.last_accessed.insert(chat_id, Instant::now());
        let history = self.history.get_mut(&chat_id)?;
        if history.len() > 1 {
            history.pop();
            history.last().copied()
        } else {
            None
        }
    }

    pub fn clear(&mut self, chat_id: i64) {
        self.history.remove(&chat_id);
        self.last_accessed.remove(&chat_id);
    }

    pub fn history_depth(&self, chat_id: i64) -> usize {
        self.history.get(&chat_id).map(|h| h.len()).unwrap_or(0)
    }

    pub fn can_go_back(&self, chat_id: i64) -> bool {
        self.history_depth(chat_id) > 1
    }

    pub fn previous_scene(&self, chat_id: i64) -> Option<SceneId> {
        let history = self.history.get(&chat_id)?;
        if history.len() >= 2 {
            Some(history[history.len() - 2])
        } else {
            None
        }
    }

    pub fn navigate_to_main_menu(&mut self, chat_id: i64) {
        self.clear(chat_id);
        self.enter(chat_id, SceneId::Menu);
    }

    pub fn is_stuck(&self, chat_id: i64) -> bool {
        let history = match self.history.get(&chat_id) {
            Some(h) => h,
            None => return false,
        };
        if history.len() > STUCK_THRESHOLD {
            return true;
        }
        for i in 1..history.len() {
            if history[i] == history[i - 1] {
                return true;
            }
        }
        false
    }

    pub fn check_depth(&self, chat_id: i64) -> (usize, bool) {
        let depth = self.history_depth(chat_id);
        let should_reset = depth >= FORCE_RESET_THRESHOLD;
        (depth, should_reset)
    }

    pub fn force_reset(&mut self, chat_id: i64) {
        self.clear(chat_id);
    }

    pub fn parse_callback(data: &str) -> Option<NavigationAction> {
        if let Some(scene_name) = data.strip_prefix("nav:") {
            if scene_name == "back" {
                return Some(NavigationAction::Back);
            }
            if scene_name == "cancel" {
                return Some(NavigationAction::Cancel);
            }
            for id in all_scene_ids() {
                if id.scene_name() == scene_name {
                    return Some(NavigationAction::Navigate(id));
                }
            }
        }
        None
    }
}

pub fn all_scene_ids() -> Vec<SceneId> {
    use SceneId::*;
    vec![
        Start, Menu, Help, TechSupport, CheckBalance, ChangeLanguage, CreateUser,
        SubscriptionCheck, Payment, RublePayment, StarPayment, CryptoPayment,
        Subscription, GetRuBill, TonPayment, TonNativePayment, NeuroPhoto, NeuroPhotoV2,
        TextToImage, TextToVideo, ImageToVideo, ImageToPrompt, ImageUpscaler,
        AiPhotoshop, FluxKontext, LipSync, FaceSwap, Morphing, TextToSpeech,
        VideoTranscription, AiCover, MusicGeneration, VoiceTraining, VoiceAvatar,
        AvatarTransform, AvatarBrain, ChatWithAvatar, DigitalAvatarBody,
        DigitalAvatarBodyV2, SelectModel, ImprovePrompt, Size, TrainFluxModel,
        UploadTrainFluxModel, InstagramScraping, InstagramParser, InstagramParserWizard,
        Balance, Invite, Email, CancelPredictions, NeuroCoder, VideoDuration,
        AiReelsEntry, AiReels, AiReelsRender, HedraRender, HeygenRender, FalRender, RemoveBg,
    ]
}

pub fn remove_emoji(text: &str) -> String {
    text.chars()
        .filter(|c| {
            let cp = *c as u32;
            !((0x1F300..=0x1F9FF).contains(&cp)
                || (0x2600..=0x26FF).contains(&cp)
                || (0x2700..=0x27BF).contains(&cp)
                || (0x1F600..=0x1F64F).contains(&cp)
                || (0x1F680..=0x1F6FF).contains(&cp)
                || (0x1F1E0..=0x1F1FF).contains(&cp)
                || (0xFE00..=0xFE0F).contains(&cp)
                || (0x200D..=0x200F).contains(&cp)
                || cp == 0x20E3
                || (0xFE000..=0xFEFFF).contains(&cp))
        })
        .collect::<String>()
        .trim()
        .to_string()
}

pub fn normalize_text(text: &str) -> String {
    let without_emoji = remove_emoji(text);
    without_emoji.trim().to_lowercase()
}

pub fn match_button_text(text: &str) -> Option<ButtonMatch> {
    if text.is_empty() {
        return None;
    }

    let action = match_navigation_text(text);
    if action.is_some() {
        return action.map(ButtonMatch::Navigation);
    }

    let cat = match_category_text(text);
    if cat.is_some() {
        return cat.map(ButtonMatch::Category);
    }

    let scene = match_item_text(text);
    if scene.is_some() {
        return scene.map(ButtonMatch::Scene);
    }

    None
}

fn match_navigation_text(text: &str) -> Option<NavigationAction> {
    let lower = text.trim().to_lowercase();
    let norm = normalize_text(text);

    let main_variants = [
        "🏠 главное меню", "🏠 main menu",
        "главное меню", "main menu",
        "/menu", "меню", "menu",
        "🚪 главное меню", "🚪 main menu",
    ];
    if main_variants.iter().any(|v| lower == *v || norm == *v || text.trim() == *v) {
        return Some(NavigationAction::Navigate(SceneId::Menu));
    }

    let cancel_variants = [
        "отмена", "cancel", "/cancel",
        "❌ отмена", "❌ cancel",
    ];
    if cancel_variants.iter().any(|v| lower == *v || norm == *v || text.trim() == *v) {
        return Some(NavigationAction::Cancel);
    }

    let back_variants = [
        "◀️ назад", "◀️ back",
        "🔙 назад", "🔙 back",
        "⬅️ назад", "⬅️ back",
        "назад", "back",
    ];
    if back_variants.iter().any(|v| lower == *v || norm == *v || text.trim() == *v) {
        return Some(NavigationAction::Back);
    }

    let help_variants = [
        "❓ справка", "❓ help",
        "справка", "help", "/help",
    ];
    if help_variants.iter().any(|v| lower == *v || norm == *v || text.trim() == *v) {
        return Some(NavigationAction::Navigate(SceneId::Help));
    }

    None
}

fn match_category_text(text: &str) -> Option<&'static str> {
    let norm = normalize_text(text);
    for cat in categories::CATEGORIES {
        if text.trim() == cat.ru || text.trim() == cat.en {
            return Some(cat.id);
        }
        let ru_norm = normalize_text(cat.ru);
        let en_norm = normalize_text(cat.en);
        if norm == ru_norm || norm == en_norm {
            return Some(cat.id);
        }
    }
    None
}

pub fn match_item_text(text: &str) -> Option<SceneId> {
    let norm = normalize_text(text);
    for cat in categories::CATEGORIES {
        for item in cat.items {
            if text.trim() == item.ru || text.trim() == item.en {
                return Some(item.scene_id);
            }
            let ru_norm = normalize_text(item.ru);
            let en_norm = normalize_text(item.en);
            if norm == ru_norm || norm == en_norm {
                return Some(item.scene_id);
            }
        }
    }
    None
}

pub fn find_item_by_scene_id(scene_id: SceneId) -> Option<(&'static CategoryConfig, &'static NavigationItem)> {
    for cat in categories::CATEGORIES {
        for item in cat.items {
            if item.scene_id == scene_id {
                return Some((cat, item));
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_router_has_no_history() {
        let router = NavigationRouter::new();
        assert!(router.current_scene(1).is_none());
    }

    #[test]
    fn enter_and_current() {
        let mut router = NavigationRouter::new();
        router.enter(1, SceneId::Menu);
        assert_eq!(router.current_scene(1), Some(SceneId::Menu));
        router.enter(1, SceneId::Help);
        assert_eq!(router.current_scene(1), Some(SceneId::Help));
    }

    #[test]
    fn go_back_returns_previous() {
        let mut router = NavigationRouter::new();
        router.enter(1, SceneId::Menu);
        router.enter(1, SceneId::NeuroPhoto);
        assert_eq!(router.go_back(1), Some(SceneId::Menu));
        assert_eq!(router.current_scene(1), Some(SceneId::Menu));
    }

    #[test]
    fn go_back_single_returns_none() {
        let mut router = NavigationRouter::new();
        router.enter(1, SceneId::Menu);
        assert!(router.go_back(1).is_none());
    }

    #[test]
    fn go_back_empty_returns_none() {
        let mut router = NavigationRouter::new();
        assert!(router.go_back(1).is_none());
    }

    #[test]
    fn clear_removes_history() {
        let mut router = NavigationRouter::new();
        router.enter(1, SceneId::Menu);
        router.enter(1, SceneId::Help);
        router.clear(1);
        assert!(router.current_scene(1).is_none());
    }

    #[test]
    fn multiple_chats_independent() {
        let mut router = NavigationRouter::new();
        router.enter(1, SceneId::Menu);
        router.enter(2, SceneId::Help);
        assert_eq!(router.current_scene(1), Some(SceneId::Menu));
        assert_eq!(router.current_scene(2), Some(SceneId::Help));
        router.clear(1);
        assert!(router.current_scene(1).is_none());
        assert_eq!(router.current_scene(2), Some(SceneId::Help));
    }

    #[test]
    fn history_depth_limit() {
        let mut router = NavigationRouter::new();
        for _ in 0..10 {
            router.enter(1, SceneId::Menu);
            router.enter(1, SceneId::Help);
            router.enter(1, SceneId::NeuroPhoto);
        }
        assert!(router.history_depth(1) <= MAX_HISTORY_DEPTH);
    }

    #[test]
    fn can_go_back() {
        let mut router = NavigationRouter::new();
        assert!(!router.can_go_back(1));
        router.enter(1, SceneId::Menu);
        assert!(!router.can_go_back(1));
        router.enter(1, SceneId::Help);
        assert!(router.can_go_back(1));
    }

    #[test]
    fn previous_scene() {
        let mut router = NavigationRouter::new();
        router.enter(1, SceneId::Menu);
        router.enter(1, SceneId::NeuroPhoto);
        assert_eq!(router.previous_scene(1), Some(SceneId::Menu));
    }

    #[test]
    fn navigate_to_main_menu() {
        let mut router = NavigationRouter::new();
        router.enter(1, SceneId::NeuroPhoto);
        router.enter(1, SceneId::Help);
        router.navigate_to_main_menu(1);
        assert_eq!(router.current_scene(1), Some(SceneId::Menu));
    }

    #[test]
    fn is_stuck_deep() {
        let mut router = NavigationRouter::new();
        for _ in 0..5 {
            router.enter(1, SceneId::Menu);
            router.enter(1, SceneId::NeuroPhoto);
        }
        assert!(router.is_stuck(1));
    }

    #[test]
    fn not_stuck_shallow() {
        let mut router = NavigationRouter::new();
        router.enter(1, SceneId::Menu);
        router.enter(1, SceneId::Help);
        assert!(!router.is_stuck(1));
    }

    #[test]
    fn check_depth() {
        let mut router = NavigationRouter::new();
        assert_eq!(router.check_depth(1), (0, false));
        router.enter(1, SceneId::Menu);
        assert_eq!(router.check_depth(1), (1, false));
    }

    #[test]
    fn parse_callback_back() {
        assert!(matches!(NavigationRouter::parse_callback("nav:back"), Some(NavigationAction::Back)));
    }

    #[test]
    fn parse_callback_cancel() {
        assert!(matches!(NavigationRouter::parse_callback("nav:cancel"), Some(NavigationAction::Cancel)));
    }

    #[test]
    fn parse_callback_navigate() {
        let action = NavigationRouter::parse_callback("nav:neuroPhotoWizard");
        assert!(matches!(action, Some(NavigationAction::Navigate(SceneId::NeuroPhoto))));
    }

    #[test]
    fn parse_callback_invalid_prefix() {
        assert!(NavigationRouter::parse_callback("invalid").is_none());
    }

    #[test]
    fn parse_callback_unknown_scene() {
        assert!(NavigationRouter::parse_callback("nav:unknownScene").is_none());
    }

    #[test]
    fn all_scene_ids_not_empty() {
        let ids = all_scene_ids();
        assert!(!ids.is_empty());
        assert!(ids.contains(&SceneId::Start));
        assert!(ids.contains(&SceneId::RemoveBg));
    }

    #[test]
    fn remove_emoji_strips_emoji() {
        assert_eq!(remove_emoji("📸 Фото"), "Фото");
        assert_eq!(remove_emoji("🎥 Видео"), "Видео");
        assert_eq!(remove_emoji("🏠 Main menu"), "Main menu");
    }

    #[test]
    fn normalize_text_works() {
        assert_eq!(normalize_text("📸 Фото"), "фото");
        assert_eq!(normalize_text("  Hello  "), "hello");
    }

    #[test]
    fn match_main_menu() {
        let result = match_button_text("🏠 Главное меню");
        assert!(matches!(result, Some(ButtonMatch::Navigation(NavigationAction::Navigate(SceneId::Menu)))));
    }

    #[test]
    fn match_cancel() {
        let result = match_button_text("Отмена");
        assert!(matches!(result, Some(ButtonMatch::Navigation(NavigationAction::Cancel))));
    }

    #[test]
    fn match_back() {
        let result = match_button_text("◀️ Назад");
        assert!(matches!(result, Some(ButtonMatch::Navigation(NavigationAction::Back))));
    }

    #[test]
    fn match_category_photo() {
        let result = match_button_text("📸 Фото");
        assert!(matches!(result, Some(ButtonMatch::Category("photo"))));
    }

    #[test]
    fn match_category_video() {
        let result = match_button_text("🎥 Video");
        assert!(matches!(result, Some(ButtonMatch::Category("video"))));
    }

    #[test]
    fn match_item_neuro_photo() {
        let result = match_button_text("📸 Нейрофото");
        assert!(matches!(result, Some(ButtonMatch::Scene(SceneId::NeuroPhoto))));
    }

    #[test]
    fn match_item_text_to_video_en() {
        let result = match_button_text("🎥 Text to Video");
        assert!(matches!(result, Some(ButtonMatch::Scene(SceneId::TextToVideo))));
    }

    #[test]
    fn match_item_balance() {
        let result = match_button_text("💰 Баланс");
        assert!(matches!(result, Some(ButtonMatch::Scene(SceneId::Balance))));
    }

    #[test]
    fn match_empty_returns_none() {
        assert!(match_button_text("").is_none());
    }

    #[test]
    fn match_unknown_returns_none() {
        assert!(match_button_text("some random text").is_none());
    }

    #[test]
    fn match_item_by_scene_id() {
        let result = find_item_by_scene_id(SceneId::NeuroPhoto);
        assert!(result.is_some());
        let (cat, item) = result.unwrap();
        assert_eq!(cat.id, "photo");
        assert_eq!(item.id, "neuro_photo");
    }

    #[test]
    fn find_item_not_found() {
        assert!(find_item_by_scene_id(SceneId::Start).is_none());
    }
}
