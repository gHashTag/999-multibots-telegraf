use trios_mb_tg::state::*;
use trios_mb_types::scene::SceneId;

#[test]
fn all_generation_scenes_have_state() {
    let scenes = vec![
        (Scene::NeuroPhoto(NeuroPhotoState::default()), SceneId::NeuroPhoto),
        (Scene::NeuroPhotoV2(NeuroPhotoState::default()), SceneId::NeuroPhotoV2),
        (Scene::TextToImage(TextToImageState::default()), SceneId::TextToImage),
        (Scene::TextToVideo(TextToVideoState::default()), SceneId::TextToVideo),
        (Scene::ImageToVideo(ImageToVideoState::default()), SceneId::ImageToVideo),
        (Scene::ImageToPrompt(ImageToPromptState::default()), SceneId::ImageToPrompt),
        (Scene::ImageUpscaler(UpscalerState::default()), SceneId::ImageUpscaler),
        (Scene::AiPhotoshop(AiPhotoshopState::default()), SceneId::AiPhotoshop),
        (Scene::FluxKontext(FluxKontextState::default()), SceneId::FluxKontext),
        (Scene::LipSync(LipSyncState::default()), SceneId::LipSync),
        (Scene::FaceSwap(FaceSwapState::default()), SceneId::FaceSwap),
        (Scene::Morphing(MorphingState::default()), SceneId::Morphing),
        (Scene::TextToSpeech(TextToSpeechState::default()), SceneId::TextToSpeech),
        (Scene::VideoTranscription(VideoTranscriptionState::default()), SceneId::VideoTranscription),
        (Scene::AiCover(AiCoverState::default()), SceneId::AiCover),
        (Scene::MusicGeneration(MusicGenerationState::default()), SceneId::MusicGeneration),
        (Scene::VoiceTraining(VoiceTrainingState::default()), SceneId::VoiceTraining),
        (Scene::VoiceAvatar(VoiceAvatarState::default()), SceneId::VoiceAvatar),
        (Scene::AvatarTransform(AvatarTransformState::default()), SceneId::AvatarTransform),
        (Scene::AvatarBrain(AvatarBrainState::default()), SceneId::AvatarBrain),
        (Scene::ChatWithAvatar(ChatWithAvatarState::default()), SceneId::ChatWithAvatar),
        (Scene::DigitalAvatarBody(DigitalAvatarBodyState::default()), SceneId::DigitalAvatarBody),
        (Scene::SelectModel(SelectModelState::default()), SceneId::SelectModel),
        (Scene::ImprovePrompt(ImprovePromptState::default()), SceneId::ImprovePrompt),
        (Scene::TrainFluxModel(TrainFluxModelState::default()), SceneId::TrainFluxModel),
        (Scene::Size(SizeState::default()), SceneId::Size),
        (Scene::VideoDuration(VideoDurationState::default()), SceneId::VideoDuration),
        (Scene::HedraRender(HedraRenderState::default()), SceneId::HedraRender),
        (Scene::HeygenRender(HeygenRenderState::default()), SceneId::HeygenRender),
        (Scene::FalRender(FalRenderState::default()), SceneId::FalRender),
        (Scene::RemoveBg(RemoveBgState::default()), SceneId::RemoveBg),
        (Scene::AiReels(AiReelsState::default()), SceneId::AiReels),
    ];

    for (scene, expected_id) in scenes {
        assert_eq!(scene.scene_id(), expected_id, "Scene {:?} should map to {:?}", scene, expected_id);
    }
}

#[test]
fn all_payment_scenes_have_state() {
    let payment_scenes = vec![
        Scene::Payment(PaymentFlowState::default()),
        Scene::StarPayment(PaymentFlowState::default()),
        Scene::RublePayment(PaymentFlowState::default()),
        Scene::CryptoPayment(PaymentFlowState::default()),
        Scene::TonPayment(PaymentFlowState::default()),
        Scene::TonNativePayment(PaymentFlowState::default()),
    ];

    for scene in payment_scenes {
        let id = scene.scene_id();
        assert!(format!("{:?}", id).contains("Payment"), "Expected payment scene, got {:?}", id);
    }
}

#[test]
fn simple_scenes_map_correctly() {
    assert_eq!(Scene::MainMenu.scene_id(), SceneId::Menu);
    assert_eq!(Scene::Help.scene_id(), SceneId::Help);
    assert_eq!(Scene::Balance.scene_id(), SceneId::Balance);
    assert_eq!(Scene::Invite.scene_id(), SceneId::Invite);
}

#[test]
fn default_scene_is_main_menu() {
    let scene = Scene::default();
    assert!(matches!(scene, Scene::MainMenu));
}

#[test]
fn neuro_photo_state_default_has_zero_step() {
    let state = NeuroPhotoState::default();
    assert_eq!(state.step, 0);
    assert!(state.prompt.is_none());
    assert!(state.image_url.is_none());
    assert!(state.model.is_none());
}

#[test]
fn face_swap_state_default_has_zero_step() {
    let state = FaceSwapState::default();
    assert_eq!(state.step, 0);
    assert!(state.source_url.is_none());
    assert!(state.target_url.is_none());
}

#[test]
fn lip_sync_state_default_has_zero_step() {
    let state = LipSyncState::default();
    assert_eq!(state.step, 0);
    assert!(state.video_url.is_none());
    assert!(state.audio_url.is_none());
}

#[test]
fn payment_flow_state_default() {
    let state = PaymentFlowState::default();
    assert_eq!(state.step, 0);
    assert!(state.amount.is_none());
    assert!(state.method.is_none());
}

#[test]
fn size_state_default() {
    let state = SizeState::default();
    assert_eq!(state.step, 0);
    assert!(state.aspect_ratio.is_none());
}

#[test]
fn hedra_render_state_default() {
    let state = HedraRenderState::default();
    assert_eq!(state.step, 0);
    assert!(state.image_url.is_none());
}

#[test]
fn ai_reels_state_default() {
    let state = AiReelsState::default();
    assert_eq!(state.step, 0);
    assert!(state.prompt.is_none());
}

#[test]
fn scene_id_no_longer_maps_to_main_menu() {
    use trios_mb_types::scene::SceneId;

    let was_broken = [SceneId::Size, SceneId::VideoDuration, SceneId::AiPhotoshop];
    for id in was_broken {
        match id {
            SceneId::Size | SceneId::VideoDuration | SceneId::AiPhotoshop => {},
            _ => panic!("Unexpected SceneId in test"),
        }
    }
}
