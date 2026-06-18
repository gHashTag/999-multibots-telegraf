use serde::{Deserialize, Serialize};
use trios_mb_types::scene::SceneId;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub enum Scene {
    #[default]
    MainMenu,

    NeuroPhoto(NeuroPhotoState),
    NeuroPhotoV2(NeuroPhotoState),
    TextToImage(TextToImageState),
    TextToVideo(TextToVideoState),
    ImageToVideo(ImageToVideoState),
    ImageToPrompt(ImageToPromptState),
    ImageUpscaler(UpscalerState),
    AiPhotoshop(AiPhotoshopState),
    FluxKontext(FluxKontextState),
    LipSync(LipSyncState),
    FaceSwap(FaceSwapState),
    Morphing(MorphingState),
    TextToSpeech(TextToSpeechState),
    VideoTranscription(VideoTranscriptionState),
    AiCover(AiCoverState),
    MusicGeneration(MusicGenerationState),
    VoiceTraining(VoiceTrainingState),
    VoiceAvatar(VoiceAvatarState),

    AvatarTransform(AvatarTransformState),
    AvatarBrain(AvatarBrainState),
    ChatWithAvatar(ChatWithAvatarState),
    DigitalAvatarBody(DigitalAvatarBodyState),

    Payment(PaymentFlowState),
    StarPayment(PaymentFlowState),
    RublePayment(PaymentFlowState),
    CryptoPayment(PaymentFlowState),
    TonPayment(PaymentFlowState),
    TonNativePayment(PaymentFlowState),

    SelectModel(SelectModelState),
    ImprovePrompt(ImprovePromptState),
    TrainFluxModel(TrainFluxModelState),
    Email(EmailState),
    Balance,
    Help,
    Invite,
    Size(SizeState),
    VideoDuration(VideoDurationState),
    HedraRender(HedraRenderState),
    HeygenRender(HeygenRenderState),
    FalRender(FalRenderState),
    RemoveBg(RemoveBgState),
    AiReels(AiReelsState),
    InstagramScraping(InstagramScrapingState),
    InstagramParser(InstagramParserState),
    TechSupport(TechSupportState),
    NeuroCoder(NeuroCoderState),
}

impl Scene {
    pub fn scene_id(&self) -> SceneId {
        match self {
            Self::MainMenu => SceneId::Menu,
            Self::NeuroPhoto(_) => SceneId::NeuroPhoto,
            Self::NeuroPhotoV2(_) => SceneId::NeuroPhotoV2,
            Self::TextToImage(_) => SceneId::TextToImage,
            Self::TextToVideo(_) => SceneId::TextToVideo,
            Self::ImageToVideo(_) => SceneId::ImageToVideo,
            Self::ImageToPrompt(_) => SceneId::ImageToPrompt,
            Self::ImageUpscaler(_) => SceneId::ImageUpscaler,
            Self::AiPhotoshop(_) => SceneId::AiPhotoshop,
            Self::FluxKontext(_) => SceneId::FluxKontext,
            Self::LipSync(_) => SceneId::LipSync,
            Self::FaceSwap(_) => SceneId::FaceSwap,
            Self::Morphing(_) => SceneId::Morphing,
            Self::TextToSpeech(_) => SceneId::TextToSpeech,
            Self::VideoTranscription(_) => SceneId::VideoTranscription,
            Self::AiCover(_) => SceneId::AiCover,
            Self::MusicGeneration(_) => SceneId::MusicGeneration,
            Self::VoiceTraining(_) => SceneId::VoiceTraining,
            Self::VoiceAvatar(_) => SceneId::VoiceAvatar,
            Self::AvatarTransform(_) => SceneId::AvatarTransform,
            Self::AvatarBrain(_) => SceneId::AvatarBrain,
            Self::ChatWithAvatar(_) => SceneId::ChatWithAvatar,
            Self::DigitalAvatarBody(_) => SceneId::DigitalAvatarBody,
            Self::Payment(_) => SceneId::Payment,
            Self::StarPayment(_) => SceneId::StarPayment,
            Self::RublePayment(_) => SceneId::RublePayment,
            Self::CryptoPayment(_) => SceneId::CryptoPayment,
            Self::TonPayment(_) => SceneId::TonPayment,
            Self::TonNativePayment(_) => SceneId::TonNativePayment,
            Self::SelectModel(_) => SceneId::SelectModel,
            Self::ImprovePrompt(_) => SceneId::ImprovePrompt,
            Self::TrainFluxModel(_) => SceneId::TrainFluxModel,
            Self::Email(_) => SceneId::Email,
            Self::Balance => SceneId::Balance,
            Self::Help => SceneId::Help,
            Self::Invite => SceneId::Invite,
            Self::Size(_) => SceneId::Size,
            Self::VideoDuration(_) => SceneId::VideoDuration,
            Self::HedraRender(_) => SceneId::HedraRender,
            Self::HeygenRender(_) => SceneId::HeygenRender,
            Self::FalRender(_) => SceneId::FalRender,
            Self::RemoveBg(_) => SceneId::RemoveBg,
            Self::AiReels(_) => SceneId::AiReels,
            Self::InstagramScraping(_) => SceneId::InstagramScraping,
            Self::InstagramParser(_) => SceneId::InstagramParser,
            Self::TechSupport(_) => SceneId::TechSupport,
            Self::NeuroCoder(_) => SceneId::NeuroCoder,
        }
    }
}

macro_rules! scene_state {
    ($name:ident { $($field:ident : $ty:ty),* $(,)? }) => {
        #[derive(Debug, Clone, Default, Serialize, Deserialize)]
        #[serde(deny_unknown_fields)]
        pub struct $name {
            pub step: u8,
            $(
                pub $field: Option<$ty>,
            )*
        }
    };
}

scene_state!(NeuroPhotoState {
    prompt: String,
    image_url: String,
    model: String,
    num_images: u8,
    gender: String,
});

scene_state!(TextToImageState {
    prompt: String,
    model: String,
    num_images: u8,
    aspect_ratio: String,
});

scene_state!(TextToVideoState {
    prompt: String,
    model: String,
    duration: u8,
    video_url: String,
    job_id: String,
});

scene_state!(ImageToVideoState {
    image_url: String,
    prompt: String,
    model: String,
    duration: u8,
    video_url: String,
    job_id: String,
});

scene_state!(ImageToPromptState {
    image_url: String,
    prompt: String,
});

scene_state!(UpscalerState {
    image_url: String,
    scale: u8,
    result_url: String,
});

scene_state!(AiPhotoshopState {
    image_url: String,
    prompt: String,
    style: String,
    model: String,
});

scene_state!(FluxKontextState {
    mode: String,
    image_a: String,
    image_b: String,
    prompt: String,
    result_url: String,
});

scene_state!(LipSyncState {
    video_url: String,
    audio_url: String,
    model: String,
    job_id: String,
    result_url: String,
});

scene_state!(FaceSwapState {
    source_url: String,
    target_url: String,
    result_url: String,
});

scene_state!(MorphingState {
    images: Vec<String>,
    morphing_type: String,
    prompt: String,
    result_url: String,
});

scene_state!(TextToSpeechState {
    text: String,
    voice_id: String,
    model: String,
    result_url: String,
});

scene_state!(VideoTranscriptionState {
    video_url: String,
    transcription: String,
});

scene_state!(AiCoverState {
    audio_url: String,
    voice_model: String,
    result_url: String,
});

scene_state!(MusicGenerationState {
    prompt: String,
    model: String,
    duration: u8,
    result_url: String,
});

scene_state!(VoiceTrainingState {
    audio_url: String,
    model_name: String,
    job_id: String,
});

scene_state!(VoiceAvatarState {
    mode: String,
    audio_url: String,
    avatar_url: String,
    result_url: String,
});

scene_state!(AvatarTransformState {
    image_url: String,
    style: String,
    result_url: String,
});

scene_state!(AvatarBrainState {
    name: String,
    personality: String,
    avatar_url: String,
});

scene_state!(ChatWithAvatarState {
    avatar_id: String,
    message: String,
});

scene_state!(DigitalAvatarBodyState {
    face_url: String,
    body_style: String,
    result_url: String,
});

scene_state!(PaymentFlowState {
    amount: f64,
    method: String,
    payment_url: String,
    external_id: String,
});

scene_state!(SelectModelState {
    model_type: String,
    selected_model: String,
});

scene_state!(ImprovePromptState {
    original_prompt: String,
    improved_prompt: String,
});

scene_state!(TrainFluxModelState {
    images: Vec<String>,
    trigger_word: String,
    model_name: String,
    job_id: String,
});

scene_state!(EmailState {
    email: String,
});

scene_state!(SizeState {
    width: u32,
    height: u32,
    aspect_ratio: String,
});

scene_state!(VideoDurationState {
    duration: u8,
    model: String,
});

scene_state!(HedraRenderState {
    image_url: String,
    audio_url: String,
    text: String,
    result_url: String,
});

scene_state!(HeygenRenderState {
    avatar_id: String,
    text: String,
    audio_url: String,
    result_url: String,
});

scene_state!(FalRenderState {
    prompt: String,
    model: String,
    image_url: String,
    result_url: String,
});

scene_state!(RemoveBgState {
    image_url: String,
    result_url: String,
});

scene_state!(AiReelsState {
    prompt: String,
    style: String,
    num_scenes: u8,
    result_url: String,
});

scene_state!(InstagramScrapingState {
    profile_url: String,
    result_url: String,
});

scene_state!(InstagramParserState {
    profile_url: String,
    target_url: String,
    result_url: String,
});

scene_state!(TechSupportState {
    subject: String,
    message: String,
});

scene_state!(NeuroCoderState {
    prompt: String,
    language: String,
    result_url: String,
});
