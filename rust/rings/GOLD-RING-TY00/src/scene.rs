use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SceneCategory {
    System,
    Generation,
    Payment,
    Wizard,
    Tools,
    Avatar,
    Admin,
    Utility,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AccessLevel {
    Public,
    Subscriber,
    Premium,
    Admin,
    Staff,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SceneStatus {
    Active,
    Deprecated,
    Disabled,
    Planned,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneMetadata {
    pub id: SceneId,
    pub name: String,
    pub category: SceneCategory,
    pub access_level: AccessLevel,
    pub status: SceneStatus,
    pub cost: Option<u32>,
    pub requires_subscription: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum SceneId {
    Start,
    Menu,
    Help,
    TechSupport,
    CheckBalance,
    ChangeLanguage,
    CreateUser,
    SubscriptionCheck,

    Payment,
    RublePayment,
    StarPayment,
    CryptoPayment,
    Subscription,
    GetRuBill,
    TonPayment,
    TonNativePayment,

    NeuroPhoto,
    NeuroPhotoV2,
    TextToImage,
    TextToVideo,
    ImageToVideo,
    ImageToPrompt,
    ImageUpscaler,
    AiPhotoshop,
    FluxKontext,
    LipSync,
    FaceSwap,
    Morphing,
    TextToSpeech,
    VideoTranscription,
    AiCover,
    MusicGeneration,
    VoiceTraining,
    VoiceAvatar,

    AvatarTransform,
    AvatarBrain,
    ChatWithAvatar,
    DigitalAvatarBody,
    DigitalAvatarBodyV2,

    SelectModel,
    ImprovePrompt,
    Size,
    TrainFluxModel,
    UploadTrainFluxModel,

    InstagramScraping,
    InstagramParser,
    InstagramParserWizard,

    Balance,
    Invite,
    Email,
    CancelPredictions,

    NeuroCoder,
    VideoDuration,

    AiReelsEntry,
    AiReels,
    AiReelsRender,
    HedraRender,
    HeygenRender,
    FalRender,

    RemoveBg,
}

impl SceneId {
    pub fn scene_name(&self) -> &'static str {
        match self {
            Self::Start => "startScene",
            Self::Menu => "menuScene",
            Self::Help => "helpScene",
            Self::TechSupport => "techSupportScene",
            Self::CheckBalance => "balanceScene",
            Self::ChangeLanguage => "changeLanguageScene",
            Self::CreateUser => "createUserScene",
            Self::SubscriptionCheck => "subscriptionCheckScene",
            Self::Payment => "paymentScene",
            Self::RublePayment => "rublePaymentScene",
            Self::StarPayment => "starPaymentScene",
            Self::CryptoPayment => "cryptoPaymentScene",
            Self::Subscription => "subscriptionScene",
            Self::GetRuBill => "getRuBillWizard",
            Self::TonPayment => "tonPaymentScene",
            Self::TonNativePayment => "tonNativePaymentScene",
            Self::NeuroPhoto => "neuroPhotoWizard",
            Self::NeuroPhotoV2 => "neuroPhotoWizardV2",
            Self::TextToImage => "textToImageWizard",
            Self::TextToVideo => "textToVideoWizard",
            Self::ImageToVideo => "imageToVideoWizard",
            Self::ImageToPrompt => "imageToPromptWizard",
            Self::ImageUpscaler => "imageUpscalerWizard",
            Self::AiPhotoshop => "aiPhotoshopScene",
            Self::FluxKontext => "fluxKontextScene",
            Self::LipSync => "lipSyncWizard",
            Self::FaceSwap => "faceSwapWizard",
            Self::Morphing => "morphingWizard",
            Self::TextToSpeech => "textToSpeechWizard",
            Self::VideoTranscription => "videoTranscriptionWizard",
            Self::AiCover => "aiCoverWizard",
            Self::MusicGeneration => "musicGenerationWizard",
            Self::VoiceTraining => "voiceTrainingWizard",
            Self::VoiceAvatar => "voiceAvatarWizard",
            Self::AvatarTransform => "avatarTransformScene",
            Self::AvatarBrain => "avatarBrainWizard",
            Self::ChatWithAvatar => "chatWithAvatarWizard",
            Self::DigitalAvatarBody => "digitalAvatarBodyWizard",
            Self::DigitalAvatarBodyV2 => "digitalAvatarBodyWizardV2",
            Self::SelectModel => "selectModelWizard",
            Self::ImprovePrompt => "improvePromptWizard",
            Self::Size => "sizeWizard",
            Self::TrainFluxModel => "trainFluxModelWizard",
            Self::UploadTrainFluxModel => "uploadTrainFluxModelScene",
            Self::InstagramScraping => "instagramScrapingWizard",
            Self::InstagramParser => "instagramParserScene",
            Self::InstagramParserWizard => "instagramParserWizard",
            Self::Balance => "balanceScene",
            Self::Invite => "inviteScene",
            Self::Email => "emailWizard",
            Self::CancelPredictions => "cancelPredictionsWizard",
            Self::NeuroCoder => "neuroCoderScene",
            Self::VideoDuration => "videoDurationScene",
            Self::AiReelsEntry => "aiReelsEntryWizard",
            Self::AiReels => "aiReelsWizard",
            Self::AiReelsRender => "aiReelsRenderWizard",
            Self::HedraRender => "hedraRenderWizard",
            Self::HeygenRender => "heygenRenderWizard",
            Self::FalRender => "falRenderWizard",
            Self::RemoveBg => "removeBgScene",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scene_name_matches_known_values() {
        assert_eq!(SceneId::Start.scene_name(), "startScene");
        assert_eq!(SceneId::Menu.scene_name(), "menuScene");
        assert_eq!(SceneId::NeuroPhoto.scene_name(), "neuroPhotoWizard");
        assert_eq!(SceneId::TextToImage.scene_name(), "textToImageWizard");
        assert_eq!(SceneId::TextToVideo.scene_name(), "textToVideoWizard");
        assert_eq!(SceneId::LipSync.scene_name(), "lipSyncWizard");
        assert_eq!(SceneId::FaceSwap.scene_name(), "faceSwapWizard");
        assert_eq!(SceneId::Payment.scene_name(), "paymentScene");
        assert_eq!(SceneId::StarPayment.scene_name(), "starPaymentScene");
        assert_eq!(SceneId::RublePayment.scene_name(), "rublePaymentScene");
        assert_eq!(SceneId::Help.scene_name(), "helpScene");
        assert_eq!(SceneId::RemoveBg.scene_name(), "removeBgScene");
    }

    #[test]
    fn scene_id_equality() {
        assert_eq!(SceneId::Start, SceneId::Start);
        assert_ne!(SceneId::Start, SceneId::Menu);
    }

    #[test]
    fn scene_category_variants() {
        let cat = SceneCategory::System;
        assert!(matches!(cat, SceneCategory::System));
        let cat = SceneCategory::Generation;
        assert!(matches!(cat, SceneCategory::Generation));
        let cat = SceneCategory::Payment;
        assert!(matches!(cat, SceneCategory::Payment));
        let cat = SceneCategory::Wizard;
        assert!(matches!(cat, SceneCategory::Wizard));
        let cat = SceneCategory::Tools;
        assert!(matches!(cat, SceneCategory::Tools));
        let cat = SceneCategory::Avatar;
        assert!(matches!(cat, SceneCategory::Avatar));
        let cat = SceneCategory::Admin;
        assert!(matches!(cat, SceneCategory::Admin));
        let cat = SceneCategory::Utility;
        assert!(matches!(cat, SceneCategory::Utility));
    }

    #[test]
    fn access_level_variants() {
        assert_ne!(AccessLevel::Public, AccessLevel::Admin);
        assert_ne!(AccessLevel::Subscriber, AccessLevel::Premium);
    }

    #[test]
    fn scene_status_variants() {
        assert_ne!(SceneStatus::Active, SceneStatus::Deprecated);
        assert_ne!(SceneStatus::Disabled, SceneStatus::Planned);
    }

    #[test]
    fn scene_metadata_serialization() {
        let meta = SceneMetadata {
            id: SceneId::Start,
            name: "Start".to_string(),
            category: SceneCategory::System,
            access_level: AccessLevel::Public,
            status: SceneStatus::Active,
            cost: None,
            requires_subscription: false,
        };
        let json = serde_json::to_string(&meta).unwrap();
        assert!(json.contains("Start"));
        let parsed: SceneMetadata = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, SceneId::Start);
        assert_eq!(parsed.category, SceneCategory::System);
    }
}
