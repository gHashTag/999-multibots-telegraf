use trios_mb_types::scene::{AccessLevel, SceneCategory, SceneId, SceneStatus};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, PartialEq)]
pub struct SceneEntry {
    pub id: SceneId,
    pub name: String,
    pub description: String,
    pub category: SceneCategory,
    pub access_level: AccessLevel,
    pub status: SceneStatus,
    pub cost: Option<u32>,
    pub requires_subscription: bool,
    pub allowed_children: Option<Vec<SceneId>>,
    pub blocked_transitions: Vec<SceneId>,
    pub tags: Vec<String>,
    pub version: String,
}

impl SceneEntry {
    fn new(id: SceneId, name: &str, category: SceneCategory, access: AccessLevel) -> Self {
        Self {
            id,
            name: name.to_string(),
            description: String::new(),
            category,
            access_level: access,
            status: SceneStatus::Active,
            cost: None,
            requires_subscription: matches!(access, AccessLevel::Subscriber | AccessLevel::Premium),
            allowed_children: None,
            blocked_transitions: vec![],
            tags: vec![],
            version: "1.0.0".to_string(),
        }
    }

    fn cost(mut self, c: u32) -> Self {
        self.cost = Some(c);
        self
    }

    fn desc(mut self, d: &str) -> Self {
        self.description = d.to_string();
        self
    }

    fn tags(mut self, t: &[&str]) -> Self {
        self.tags = t.iter().map(|s| s.to_string()).collect();
        self
    }
}

pub struct SceneRegistry {
    scenes: HashMap<SceneId, SceneEntry>,
}

impl Default for SceneRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl SceneRegistry {
    pub fn new() -> Self {
        let mut scenes = HashMap::new();

        let system = [
            SceneEntry::new(SceneId::Start, "Start", SceneCategory::System, AccessLevel::Public).desc("Welcome and registration").tags(&["start", "welcome"]),
            SceneEntry::new(SceneId::Menu, "Menu", SceneCategory::System, AccessLevel::Public).desc("Main bot menu").tags(&["menu", "main"]),
            SceneEntry::new(SceneId::Help, "Help", SceneCategory::System, AccessLevel::Public).desc("Help and instructions").tags(&["help", "info"]),
            SceneEntry::new(SceneId::TechSupport, "Tech Support", SceneCategory::System, AccessLevel::Public).desc("Technical support contacts").tags(&["support", "help"]),
            SceneEntry::new(SceneId::CheckBalance, "Check Balance", SceneCategory::System, AccessLevel::Public).desc("Check user balance").tags(&["balance", "check"]),
            SceneEntry::new(SceneId::ChangeLanguage, "Change Language", SceneCategory::System, AccessLevel::Public).desc("Change interface language").tags(&["language", "settings"]),
            SceneEntry::new(SceneId::CreateUser, "Create User", SceneCategory::System, AccessLevel::Public).desc("Register new user").tags(&["user", "create"]),
            SceneEntry::new(SceneId::SubscriptionCheck, "Subscription Check", SceneCategory::System, AccessLevel::Public).desc("Check subscription status").tags(&["subscription", "check"]),
        ];
        for e in system { scenes.insert(e.id, e); }

        let payment = [
            SceneEntry::new(SceneId::Payment, "Payment", SceneCategory::Payment, AccessLevel::Public).desc("Payment processing").tags(&["payment"]),
            SceneEntry::new(SceneId::RublePayment, "Ruble Payment", SceneCategory::Payment, AccessLevel::Public).desc("Pay with rubles").tags(&["payment", "rubles"]),
            SceneEntry::new(SceneId::StarPayment, "Star Payment", SceneCategory::Payment, AccessLevel::Public).desc("Pay with Telegram Stars").tags(&["payment", "stars"]),
            SceneEntry::new(SceneId::CryptoPayment, "Crypto Payment", SceneCategory::Payment, AccessLevel::Public).desc("Pay with USDC on Base").tags(&["payment", "crypto"]),
            SceneEntry::new(SceneId::Subscription, "Subscription", SceneCategory::Payment, AccessLevel::Public).desc("Subscription management").tags(&["subscription", "payment"]),
            SceneEntry::new(SceneId::GetRuBill, "Get RU Bill", SceneCategory::Payment, AccessLevel::Public).desc("Generate invoice").tags(&["bill", "invoice"]),
            SceneEntry::new(SceneId::TonPayment, "TON Payment", SceneCategory::Payment, AccessLevel::Public).desc("Pay with TON").tags(&["payment", "ton"]),
            SceneEntry::new(SceneId::TonNativePayment, "TON Native Payment", SceneCategory::Payment, AccessLevel::Public).desc("Pay with TON native").tags(&["payment", "ton"]),
        ];
        for e in payment { scenes.insert(e.id, e); }

        let generation = [
            SceneEntry::new(SceneId::NeuroPhoto, "Neuro Photo", SceneCategory::Generation, AccessLevel::Subscriber).cost(10).desc("AI photo generation").tags(&["photo", "generation"]),
            SceneEntry::new(SceneId::NeuroPhotoV2, "Neuro Photo V2", SceneCategory::Generation, AccessLevel::Subscriber).cost(15).desc("Improved photo generation").tags(&["photo", "generation", "v2"]),
            SceneEntry::new(SceneId::TextToImage, "Text to Image", SceneCategory::Generation, AccessLevel::Subscriber).cost(8).desc("Generate image from text").tags(&["text", "image"]),
            SceneEntry::new(SceneId::TextToVideo, "Text to Video", SceneCategory::Generation, AccessLevel::Subscriber).cost(50).desc("Generate video from text").tags(&["text", "video"]),
            SceneEntry::new(SceneId::ImageToVideo, "Image to Video", SceneCategory::Generation, AccessLevel::Subscriber).cost(40).desc("Create video from image").tags(&["image", "video"]),
            SceneEntry::new(SceneId::ImageToPrompt, "Image to Prompt", SceneCategory::Generation, AccessLevel::Subscriber).cost(5).desc("Generate prompt from image").tags(&["image", "prompt"]),
            SceneEntry::new(SceneId::ImageUpscaler, "Image Upscaler", SceneCategory::Generation, AccessLevel::Subscriber).cost(5).desc("Upscale image quality").tags(&["upscale", "image"]),
            SceneEntry::new(SceneId::AiPhotoshop, "AI Photoshop", SceneCategory::Generation, AccessLevel::Subscriber).cost(10).desc("AI image editing").tags(&["photoshop", "edit"]),
            SceneEntry::new(SceneId::FluxKontext, "Flux Kontext", SceneCategory::Generation, AccessLevel::Subscriber).cost(15).desc("Flux Kontext generation").tags(&["flux", "kontext"]),
            SceneEntry::new(SceneId::LipSync, "Lip Sync", SceneCategory::Generation, AccessLevel::Subscriber).cost(30).desc("Lip sync audio to video").tags(&["lip", "sync"]),
            SceneEntry::new(SceneId::FaceSwap, "Face Swap", SceneCategory::Generation, AccessLevel::Subscriber).cost(15).desc("Face swap on image").tags(&["face", "swap"]),
            SceneEntry::new(SceneId::Morphing, "Morphing", SceneCategory::Generation, AccessLevel::Subscriber).cost(20).desc("Image morphing").tags(&["morphing"]),
            SceneEntry::new(SceneId::TextToSpeech, "Text to Speech", SceneCategory::Generation, AccessLevel::Subscriber).cost(5).desc("Convert text to voice").tags(&["tts", "voice"]),
            SceneEntry::new(SceneId::VideoTranscription, "Video Transcription", SceneCategory::Tools, AccessLevel::Subscriber).cost(10).desc("Extract text from video").tags(&["transcription", "video"]),
            SceneEntry::new(SceneId::AiCover, "AI Cover", SceneCategory::Generation, AccessLevel::Subscriber).cost(10).desc("AI cover generation").tags(&["cover", "audio"]),
            SceneEntry::new(SceneId::MusicGeneration, "Music Generation", SceneCategory::Generation, AccessLevel::Subscriber).cost(15).desc("Generate music").tags(&["music", "generation"]),
            SceneEntry::new(SceneId::VoiceTraining, "Voice Training", SceneCategory::Wizard, AccessLevel::Subscriber).cost(20).desc("Train voice model").tags(&["voice", "training"]),
            SceneEntry::new(SceneId::VoiceAvatar, "Voice Avatar", SceneCategory::Avatar, AccessLevel::Subscriber).cost(30).desc("Create voice avatar").tags(&["voice", "avatar"]),
        ];
        for e in generation { scenes.insert(e.id, e); }

        let avatar = [
            SceneEntry::new(SceneId::AvatarTransform, "Avatar Transform", SceneCategory::Avatar, AccessLevel::Subscriber).cost(20).desc("Transform digital avatar").tags(&["avatar", "transform"]),
            SceneEntry::new(SceneId::AvatarBrain, "Avatar Brain", SceneCategory::Avatar, AccessLevel::Subscriber).cost(20).desc("Configure avatar intelligence").tags(&["avatar", "brain"]),
            SceneEntry::new(SceneId::ChatWithAvatar, "Chat with Avatar", SceneCategory::Avatar, AccessLevel::Subscriber).cost(5).desc("Chat with digital avatar").tags(&["chat", "avatar"]),
            SceneEntry::new(SceneId::DigitalAvatarBody, "Digital Avatar Body", SceneCategory::Avatar, AccessLevel::Subscriber).cost(100).desc("Create digital body").tags(&["avatar", "body"]),
            SceneEntry::new(SceneId::DigitalAvatarBodyV2, "Digital Avatar Body V2", SceneCategory::Avatar, AccessLevel::Subscriber).cost(150).desc("Improved digital body").tags(&["avatar", "body", "v2"]),
        ];
        for e in avatar { scenes.insert(e.id, e); }

        let wizard = [
            SceneEntry::new(SceneId::SelectModel, "Select Model", SceneCategory::Wizard, AccessLevel::Public).desc("Select avatar language").tags(&["wizard", "model"]),
            SceneEntry::new(SceneId::ImprovePrompt, "Improve Prompt", SceneCategory::Wizard, AccessLevel::Subscriber).cost(2).desc("Improve AI prompt").tags(&["prompt", "improve"]),
            SceneEntry::new(SceneId::Size, "Size Wizard", SceneCategory::Wizard, AccessLevel::Public).desc("Select generation size").tags(&["size", "wizard"]),
            SceneEntry::new(SceneId::TrainFluxModel, "Train Flux Model", SceneCategory::Wizard, AccessLevel::Premium).cost(500).desc("Train custom Flux model").tags(&["train", "flux"]),
            SceneEntry::new(SceneId::UploadTrainFluxModel, "Upload Train Data", SceneCategory::Wizard, AccessLevel::Premium).desc("Upload training images").tags(&["upload", "train"]),
        ];
        for e in wizard { scenes.insert(e.id, e); }

        let tools = [
            SceneEntry::new(SceneId::InstagramScraping, "Instagram Scraping", SceneCategory::Tools, AccessLevel::Admin).desc("Parse Instagram content").tags(&["instagram", "parsing"]),
            SceneEntry::new(SceneId::InstagramParser, "Instagram Parser", SceneCategory::Tools, AccessLevel::Admin).desc("Analyze Instagram posts").tags(&["instagram", "parser"]),
            SceneEntry::new(SceneId::InstagramParserWizard, "Instagram Parser Wizard", SceneCategory::Tools, AccessLevel::Admin).desc("Instagram parser wizard").tags(&["instagram", "parser"]),
            SceneEntry::new(SceneId::NeuroCoder, "Neuro Coder", SceneCategory::Tools, AccessLevel::Subscriber).cost(10).desc("AI coding assistant").tags(&["code", "ai"]),
        ];
        for e in tools { scenes.insert(e.id, e); }

        let utility = [
            SceneEntry::new(SceneId::Balance, "Balance", SceneCategory::Utility, AccessLevel::Public).desc("View balance and history").tags(&["balance", "wallet"]),
            SceneEntry::new(SceneId::Invite, "Invite Friend", SceneCategory::Utility, AccessLevel::Public).desc("Referral system").tags(&["invite", "referral"]),
            SceneEntry::new(SceneId::Email, "Email", SceneCategory::Utility, AccessLevel::Public).desc("Email management").tags(&["email", "settings"]),
            SceneEntry::new(SceneId::CancelPredictions, "Cancel Predictions", SceneCategory::Utility, AccessLevel::Public).desc("Cancel running tasks").tags(&["cancel", "predictions"]),
        ];
        for e in utility { scenes.insert(e.id, e); }

        let render = [
            SceneEntry::new(SceneId::AiReelsEntry, "AI Reels Entry", SceneCategory::Generation, AccessLevel::Subscriber).desc("AI Reels entry point").tags(&["reels", "entry"]),
            SceneEntry::new(SceneId::AiReels, "AI Reels", SceneCategory::Generation, AccessLevel::Subscriber).cost(50).desc("Create AI Reels video").tags(&["reels", "ai"]),
            SceneEntry::new(SceneId::AiReelsRender, "AI Reels Render", SceneCategory::Generation, AccessLevel::Subscriber).cost(50).desc("Render AI Reels").tags(&["reels", "render"]),
            SceneEntry::new(SceneId::HedraRender, "Hedra Render", SceneCategory::Generation, AccessLevel::Subscriber).cost(30).desc("Render via Hedra").tags(&["hedra", "render"]),
            SceneEntry::new(SceneId::HeygenRender, "HeyGen Render", SceneCategory::Generation, AccessLevel::Subscriber).cost(50).desc("Render via HeyGen").tags(&["heygen", "render"]),
            SceneEntry::new(SceneId::FalRender, "Fal Render", SceneCategory::Generation, AccessLevel::Subscriber).cost(30).desc("Render via Fal.ai").tags(&["fal", "render"]),
        ];
        for e in render { scenes.insert(e.id, e); }

        let other = [
            SceneEntry::new(SceneId::VideoDuration, "Video Duration", SceneCategory::Utility, AccessLevel::Public).desc("Select video duration").tags(&["video", "duration"]),
            SceneEntry::new(SceneId::RemoveBg, "Remove Background", SceneCategory::Generation, AccessLevel::Subscriber).cost(5).desc("Remove image background").tags(&["removebg", "image"]),
        ];
        for e in other { scenes.insert(e.id, e); }

        Self { scenes }
    }

    pub fn get(&self, id: &SceneId) -> Option<&SceneEntry> {
        self.scenes.get(id)
    }

    pub fn by_category(&self, category: SceneCategory) -> Vec<&SceneEntry> {
        let mut result: Vec<_> = self.scenes.values()
            .filter(|e| e.category == category && e.status == SceneStatus::Active)
            .collect();
        result.sort_by_key(|e| e.id.scene_name());
        result
    }

    pub fn by_access_level(&self, access: AccessLevel) -> Vec<&SceneEntry> {
        self.scenes.values()
            .filter(|e| e.access_level == access && e.status == SceneStatus::Active)
            .collect()
    }

    pub fn active_scenes(&self) -> Vec<&SceneEntry> {
        self.scenes.values()
            .filter(|e| e.status == SceneStatus::Active)
            .collect()
    }

    pub fn check_access(&self, id: &SceneId, is_subscriber: bool, is_admin: bool) -> bool {
        match self.scenes.get(id) {
            Some(entry) => {
                if entry.status != SceneStatus::Active {
                    return false;
                }
                match entry.access_level {
                    AccessLevel::Public => true,
                    AccessLevel::Subscriber => is_subscriber || is_admin,
                    AccessLevel::Premium => is_subscriber || is_admin,
                    AccessLevel::Admin => is_admin,
                    AccessLevel::Staff => is_admin,
                }
            }
            None => true,
        }
    }

    pub fn is_transition_allowed(&self, from: SceneId, to: SceneId) -> bool {
        let from_entry = match self.scenes.get(&from) {
            Some(e) => e,
            None => return false,
        };
        if from_entry.blocked_transitions.contains(&to) {
            return false;
        }
        if let Some(ref children) = from_entry.allowed_children {
            if !children.contains(&to) {
                return false;
            }
        }
        self.scenes.contains_key(&to)
    }

    pub fn get_allowed_transitions(&self, from: SceneId) -> Vec<SceneId> {
        let mut transitions = HashSet::new();
        if let Some(entry) = self.scenes.get(&from) {
            if let Some(ref children) = entry.allowed_children {
                for child in children {
                    if self.scenes.contains_key(child) {
                        transitions.insert(*child);
                    }
                }
            }
        }
        transitions.insert(SceneId::Menu);
        transitions.insert(SceneId::Help);
        transitions.into_iter().collect()
    }

    pub fn scene_count(&self) -> usize {
        self.scenes.len()
    }

    pub fn scene_ids(&self) -> Vec<SceneId> {
        self.scenes.keys().copied().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_registry_has_scenes() {
        let reg = SceneRegistry::new();
        assert!(reg.get(&SceneId::Start).is_some());
        assert!(reg.get(&SceneId::Menu).is_some());
    }

    #[test]
    fn all_scene_ids_registered() {
        let reg = SceneRegistry::new();
        for id in crate::navigation::all_scene_ids() {
            assert!(reg.get(&id).is_some(), "Scene {:?} not registered", id);
        }
    }

    #[test]
    fn system_scenes_are_public() {
        let reg = SceneRegistry::new();
        for id in &[SceneId::Start, SceneId::Menu, SceneId::Help] {
            let entry = reg.get(id).unwrap();
            assert_eq!(entry.access_level, AccessLevel::Public);
            assert_eq!(entry.category, SceneCategory::System);
        }
    }

    #[test]
    fn generation_scenes_have_cost() {
        let reg = SceneRegistry::new();
        let entry = reg.get(&SceneId::NeuroPhoto).unwrap();
        assert_eq!(entry.category, SceneCategory::Generation);
        assert!(entry.cost.is_some());
        assert!(entry.cost.unwrap() > 0);
    }

    #[test]
    fn payment_scenes_category() {
        let reg = SceneRegistry::new();
        for id in &[SceneId::Payment, SceneId::StarPayment, SceneId::RublePayment] {
            let entry = reg.get(id).unwrap();
            assert_eq!(entry.category, SceneCategory::Payment);
        }
    }

    #[test]
    fn by_category_system() {
        let reg = SceneRegistry::new();
        let scenes = reg.by_category(SceneCategory::System);
        assert!(scenes.len() >= 7);
        for s in &scenes {
            assert_eq!(s.category, SceneCategory::System);
        }
    }

    #[test]
    fn by_category_generation() {
        let reg = SceneRegistry::new();
        let scenes = reg.by_category(SceneCategory::Generation);
        assert!(scenes.len() >= 10);
        for s in &scenes {
            assert_eq!(s.category, SceneCategory::Generation);
        }
    }

    #[test]
    fn by_category_payment() {
        let reg = SceneRegistry::new();
        let scenes = reg.by_category(SceneCategory::Payment);
        assert!(scenes.len() >= 6);
    }

    #[test]
    fn by_category_avatar() {
        let reg = SceneRegistry::new();
        let scenes = reg.by_category(SceneCategory::Avatar);
        assert!(scenes.len() >= 5);
    }

    #[test]
    fn check_access_public_always_true() {
        let reg = SceneRegistry::new();
        assert!(reg.check_access(&SceneId::Start, false, false));
        assert!(reg.check_access(&SceneId::Start, true, false));
        assert!(reg.check_access(&SceneId::Start, false, true));
    }

    #[test]
    fn check_access_subscriber_requires_sub() {
        let reg = SceneRegistry::new();
        assert!(!reg.check_access(&SceneId::NeuroPhoto, false, false));
        assert!(reg.check_access(&SceneId::NeuroPhoto, true, false));
        assert!(reg.check_access(&SceneId::NeuroPhoto, false, true));
    }

    #[test]
    fn check_access_admin_requires_admin() {
        let reg = SceneRegistry::new();
        assert!(!reg.check_access(&SceneId::InstagramScraping, false, false));
        assert!(!reg.check_access(&SceneId::InstagramScraping, true, false));
        assert!(reg.check_access(&SceneId::InstagramScraping, false, true));
    }

    #[test]
    fn is_transition_allowed() {
        let reg = SceneRegistry::new();
        assert!(reg.is_transition_allowed(SceneId::Menu, SceneId::NeuroPhoto));
        assert!(reg.is_transition_allowed(SceneId::NeuroPhoto, SceneId::Menu));
        assert!(reg.is_transition_allowed(SceneId::Menu, SceneId::Help));
    }

    #[test]
    fn get_allowed_transitions_includes_menu_and_help() {
        let reg = SceneRegistry::new();
        let transitions = reg.get_allowed_transitions(SceneId::NeuroPhoto);
        assert!(transitions.contains(&SceneId::Menu));
        assert!(transitions.contains(&SceneId::Help));
    }

    #[test]
    fn scene_count() {
        let reg = SceneRegistry::new();
        assert!(reg.scene_count() >= 55);
    }

    #[test]
    fn entry_has_name_and_description() {
        let reg = SceneRegistry::new();
        let entry = reg.get(&SceneId::NeuroPhoto).unwrap();
        assert!(!entry.name.is_empty());
        assert!(!entry.description.is_empty());
    }

    #[test]
    fn subscription_required_flag() {
        let reg = SceneRegistry::new();
        let public = reg.get(&SceneId::Start).unwrap();
        assert!(!public.requires_subscription);
        let sub = reg.get(&SceneId::NeuroPhoto).unwrap();
        assert!(sub.requires_subscription);
    }
}
