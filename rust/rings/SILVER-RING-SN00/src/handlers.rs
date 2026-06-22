use std::sync::Arc;
use teloxide::dispatching::dialogue::{Dialogue, InMemStorage, GetChatId};
use teloxide::dispatching::UpdateHandler;
use teloxide::dptree;
use teloxide::prelude::*;
use teloxide::types::{Update, ChatId};
use teloxide::utils::command::BotCommands;
use trios_mb_traits::Database;
use trios_mb_tg::state::Scene;
use trios_mb_tg::{HandlerResult, HandlerError, answer_callback_query_timeout, send_message_timeout, dialogue_update_timeout, dialogue_exit_timeout};
use trios_mb_tg::keyboards::main_menu_keyboard;
use crate::generation_utils::{load_lang, load_lang_by_id};

type MyDialogue = Dialogue<Scene, InMemStorage<Scene>>;

use crate::start::handle_start;
use crate::menu::handle_menu;
use crate::help::handle_help;
use crate::balance::handle_balance;
use crate::change_language::handle_change_language;
use crate::payment::{handle_payment_msg, handle_payment_callback};
use crate::neuro_photo::{handle_neuro_photo_msg, handle_neuro_photo_callback};
use crate::text_to_image::{handle_text_to_image_msg, handle_text_to_image_callback};
use crate::text_to_video::{handle_text_to_video_msg, handle_text_to_video_callback};
use crate::lip_sync::{handle_lip_sync_msg, handle_lip_sync_callback};
use crate::image_to_video::{handle_image_to_video_msg, handle_image_to_video_callback};
use crate::image_to_prompt::{handle_image_to_prompt_msg, handle_image_to_prompt_callback};
use crate::image_upscaler::{handle_image_upscaler_msg, handle_image_upscaler_callback};
use crate::flux_kontext::{handle_flux_kontext_msg, handle_flux_kontext_callback};
use crate::face_swap::{handle_face_swap_msg, handle_face_swap_callback};
use crate::morphing::{handle_morphing_msg, handle_morphing_callback};
use crate::text_to_speech::{handle_text_to_speech_msg, handle_text_to_speech_callback};
use crate::video_transcription::{handle_video_transcription_msg, handle_video_transcription_callback};
use crate::music_generation::{handle_music_generation_msg, handle_music_generation_callback};
use crate::voice_avatar::{handle_voice_avatar_msg, handle_voice_avatar_callback};
use crate::voice_training::{handle_voice_training_msg, handle_voice_training_callback};
use crate::ai_cover::{handle_ai_cover_msg, handle_ai_cover_callback};
use crate::avatar_transform::{handle_avatar_transform_msg, handle_avatar_transform_callback};
use crate::avatar_brain::{handle_avatar_brain_msg, handle_avatar_brain_callback};
use crate::chat_with_avatar::{handle_chat_with_avatar_msg, handle_chat_with_avatar_callback};
use crate::digital_avatar_body::{handle_digital_avatar_body_msg, handle_digital_avatar_body_callback};
use crate::select_model::{handle_select_model_msg, handle_select_model_callback};
use crate::improve_prompt::{handle_improve_prompt_msg, handle_improve_prompt_callback};
use crate::train_flux_model::{handle_train_flux_model_msg, handle_train_flux_model_callback};
use crate::invite::handle_invite_msg;
use crate::email::handle_email_msg;
use crate::ai_photoshop::{handle_ai_photoshop_msg, handle_ai_photoshop_callback};
use crate::hedra_render::{handle_hedra_render_msg, handle_hedra_render_callback};
use crate::heygen_render::{handle_heygen_render_msg, handle_heygen_render_callback};
use crate::fal_render::{handle_fal_render_msg, handle_fal_render_callback};
use crate::remove_bg::{handle_remove_bg_msg, handle_remove_bg_callback};
use crate::ai_reels::{handle_ai_reels_msg, handle_ai_reels_callback};
use crate::size::{handle_size_msg, handle_size_callback};
use crate::video_duration::{handle_video_duration_msg, handle_video_duration_callback};
use crate::instagram_scraping::handle_instagram_scraping_msg;
use crate::instagram_parser::handle_instagram_parser_msg;
use crate::tech_support::handle_tech_support_msg;
use crate::neuro_coder::handle_neuro_coder_msg;


#[derive(BotCommands, Clone, Debug)]
#[command(rename_rule = "lowercase")]
enum Command {
    #[command(description = "Start")]
    Start,
    #[command(description = "Help")]
    Help,
    #[command(description = "Balance")]
    Balance,
    #[command(description = "Language")]
    Lang,
    #[command(description = "Menu")]
    Menu,
}

pub fn build_scene_tree() -> UpdateHandler<HandlerError> {
    let command_branch = Update::filter_message()
        .filter_command::<Command>()
        .endpoint(handle_command);

    let nav_branch = Update::filter_callback_query()
        .filter_map(|q: teloxide::types::CallbackQuery| q.data.clone())
        .filter(|data: String| data.starts_with("nav:"))
        .endpoint(handle_nav_callback);

    let message_branch = Update::filter_message()
        .enter_dialogue::<Message, InMemStorage<Scene>, Scene>()
        .branch(dptree::case![Scene::MainMenu].endpoint(handle_main_menu_msg))
        .branch(dptree::case![Scene::Help].endpoint(handle_help_state_msg))
        .branch(dptree::case![Scene::Balance].endpoint(handle_balance_state_msg))
        .branch(dptree::case![Scene::NeuroPhoto(state)].endpoint(handle_neuro_photo_msg))
        .branch(dptree::case![Scene::NeuroPhotoV2(state)].endpoint(handle_neuro_photo_msg))
        .branch(dptree::case![Scene::TextToImage(state)].endpoint(handle_text_to_image_msg))
        .branch(dptree::case![Scene::TextToVideo(state)].endpoint(handle_text_to_video_msg))
        .branch(dptree::case![Scene::LipSync(state)].endpoint(handle_lip_sync_msg))
        .branch(dptree::case![Scene::Payment(state)].endpoint(handle_payment_msg))
        .branch(dptree::case![Scene::StarPayment(state)].endpoint(handle_payment_msg))
        .branch(dptree::case![Scene::RublePayment(state)].endpoint(handle_payment_msg))
        .branch(dptree::case![Scene::CryptoPayment(state)].endpoint(handle_payment_msg))
        .branch(dptree::case![Scene::TonPayment(state)].endpoint(handle_payment_msg))
        .branch(dptree::case![Scene::TonNativePayment(state)].endpoint(handle_payment_msg))
        .branch(dptree::case![Scene::ImageToVideo(state)].endpoint(handle_image_to_video_msg))
        .branch(dptree::case![Scene::ImageToPrompt(state)].endpoint(handle_image_to_prompt_msg))
        .branch(dptree::case![Scene::ImageUpscaler(state)].endpoint(handle_image_upscaler_msg))
        .branch(dptree::case![Scene::FluxKontext(state)].endpoint(handle_flux_kontext_msg))
        .branch(dptree::case![Scene::FaceSwap(state)].endpoint(handle_face_swap_msg))
        .branch(dptree::case![Scene::Morphing(state)].endpoint(handle_morphing_msg))
        .branch(dptree::case![Scene::TextToSpeech(state)].endpoint(handle_text_to_speech_msg))
        .branch(dptree::case![Scene::VideoTranscription(state)].endpoint(handle_video_transcription_msg))
        .branch(dptree::case![Scene::AiCover(state)].endpoint(handle_ai_cover_msg))
        .branch(dptree::case![Scene::MusicGeneration(state)].endpoint(handle_music_generation_msg))
        .branch(dptree::case![Scene::VoiceTraining(state)].endpoint(handle_voice_training_msg))
        .branch(dptree::case![Scene::VoiceAvatar(state)].endpoint(handle_voice_avatar_msg))
        .branch(dptree::case![Scene::AvatarTransform(state)].endpoint(handle_avatar_transform_msg))
        .branch(dptree::case![Scene::AvatarBrain(state)].endpoint(handle_avatar_brain_msg))
        .branch(dptree::case![Scene::ChatWithAvatar(state)].endpoint(handle_chat_with_avatar_msg))
        .branch(dptree::case![Scene::DigitalAvatarBody(state)].endpoint(handle_digital_avatar_body_msg))
        .branch(dptree::case![Scene::SelectModel(state)].endpoint(handle_select_model_msg))
        .branch(dptree::case![Scene::ImprovePrompt(state)].endpoint(handle_improve_prompt_msg))
        .branch(dptree::case![Scene::TrainFluxModel(state)].endpoint(handle_train_flux_model_msg))
        .branch(dptree::case![Scene::Email(state)].endpoint(handle_email_msg))
        .branch(dptree::case![Scene::Invite].endpoint(handle_invite_msg))
        .branch(dptree::case![Scene::AiPhotoshop(state)].endpoint(handle_ai_photoshop_msg))
        .branch(dptree::case![Scene::Size(state)].endpoint(handle_size_msg))
        .branch(dptree::case![Scene::VideoDuration(state)].endpoint(handle_video_duration_msg))
        .branch(dptree::case![Scene::HedraRender(state)].endpoint(handle_hedra_render_msg))
        .branch(dptree::case![Scene::HeygenRender(state)].endpoint(handle_heygen_render_msg))
        .branch(dptree::case![Scene::FalRender(state)].endpoint(handle_fal_render_msg))
        .branch(dptree::case![Scene::RemoveBg(state)].endpoint(handle_remove_bg_msg))
        .branch(dptree::case![Scene::AiReels(state)].endpoint(handle_ai_reels_msg))
        .branch(dptree::case![Scene::InstagramScraping(state)].endpoint(handle_instagram_scraping_msg))
        .branch(dptree::case![Scene::InstagramParser(state)].endpoint(handle_instagram_parser_msg))
        .branch(dptree::case![Scene::TechSupport(state)].endpoint(handle_tech_support_msg))
        .branch(dptree::case![Scene::NeuroCoder(state)].endpoint(handle_neuro_coder_msg));

    let callback_branch = Update::filter_callback_query()
        .enter_dialogue::<teloxide::types::CallbackQuery, InMemStorage<Scene>, Scene>()
        .branch(dptree::case![Scene::NeuroPhoto(state)].endpoint(handle_neuro_photo_callback))
        .branch(dptree::case![Scene::TextToImage(state)].endpoint(handle_text_to_image_callback))
        .branch(dptree::case![Scene::TextToVideo(state)].endpoint(handle_text_to_video_callback))
        .branch(dptree::case![Scene::LipSync(state)].endpoint(handle_lip_sync_callback))
        .branch(dptree::case![Scene::Payment(state)].endpoint(handle_payment_callback))
        .branch(dptree::case![Scene::StarPayment(state)].endpoint(handle_payment_callback))
        .branch(dptree::case![Scene::RublePayment(state)].endpoint(handle_payment_callback))
        .branch(dptree::case![Scene::CryptoPayment(state)].endpoint(handle_payment_callback))
        .branch(dptree::case![Scene::TonPayment(state)].endpoint(handle_payment_callback))
        .branch(dptree::case![Scene::TonNativePayment(state)].endpoint(handle_payment_callback))
        .branch(dptree::case![Scene::ImageToVideo(state)].endpoint(handle_image_to_video_callback))
        .branch(dptree::case![Scene::ImageToPrompt(state)].endpoint(handle_image_to_prompt_callback))
        .branch(dptree::case![Scene::ImageUpscaler(state)].endpoint(handle_image_upscaler_callback))
        .branch(dptree::case![Scene::FluxKontext(state)].endpoint(handle_flux_kontext_callback))
        .branch(dptree::case![Scene::FaceSwap(state)].endpoint(handle_face_swap_callback))
        .branch(dptree::case![Scene::Morphing(state)].endpoint(handle_morphing_callback))
        .branch(dptree::case![Scene::TextToSpeech(state)].endpoint(handle_text_to_speech_callback))
        .branch(dptree::case![Scene::VideoTranscription(state)].endpoint(handle_video_transcription_callback))
        .branch(dptree::case![Scene::MusicGeneration(state)].endpoint(handle_music_generation_callback))
        .branch(dptree::case![Scene::VoiceTraining(state)].endpoint(handle_voice_training_callback))
        .branch(dptree::case![Scene::AiCover(state)].endpoint(handle_ai_cover_callback))
        .branch(dptree::case![Scene::AvatarTransform(state)].endpoint(handle_avatar_transform_callback))
        .branch(dptree::case![Scene::AvatarBrain(state)].endpoint(handle_avatar_brain_callback))
        .branch(dptree::case![Scene::ChatWithAvatar(state)].endpoint(handle_chat_with_avatar_callback))
        .branch(dptree::case![Scene::DigitalAvatarBody(state)].endpoint(handle_digital_avatar_body_callback))
        .branch(dptree::case![Scene::SelectModel(state)].endpoint(handle_select_model_callback))
        .branch(dptree::case![Scene::ImprovePrompt(state)].endpoint(handle_improve_prompt_callback))
        .branch(dptree::case![Scene::TrainFluxModel(state)].endpoint(handle_train_flux_model_callback))
        .branch(dptree::case![Scene::VoiceAvatar(state)].endpoint(handle_voice_avatar_callback))
        .branch(dptree::case![Scene::AiPhotoshop(state)].endpoint(handle_ai_photoshop_callback))
        .branch(dptree::case![Scene::Size(state)].endpoint(handle_size_callback))
        .branch(dptree::case![Scene::VideoDuration(state)].endpoint(handle_video_duration_callback))
        .branch(dptree::case![Scene::HedraRender(state)].endpoint(handle_hedra_render_callback))
        .branch(dptree::case![Scene::HeygenRender(state)].endpoint(handle_heygen_render_callback))
        .branch(dptree::case![Scene::FalRender(state)].endpoint(handle_fal_render_callback))
        .branch(dptree::case![Scene::RemoveBg(state)].endpoint(handle_remove_bg_callback))
        .branch(dptree::case![Scene::AiReels(state)].endpoint(handle_ai_reels_callback));

    dptree::entry()
        .branch(command_branch)
        .branch(nav_branch)
        .branch(message_branch)
        .branch(callback_branch)
}

#[tracing::instrument(skip_all, fields(cmd = ?cmd))]
async fn handle_command(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
    cmd: Command,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    match cmd {
        Command::Start => handle_start(bot, db, dialogue, msg, lang).await,
        Command::Help => handle_help(bot, db, dialogue, msg, lang).await,
        Command::Balance => handle_balance(bot, db, dialogue, msg, lang).await,
        Command::Lang => handle_change_language(bot, db, dialogue, msg, lang).await,
        Command::Menu => handle_menu(bot, db, dialogue, msg, lang).await,
    }
}

#[tracing::instrument(skip_all)]
async fn handle_nav_callback(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    q: teloxide::types::CallbackQuery,
    data: String,
) -> HandlerResult {
    let tid = q.from.id.0 as i64;
    if tid <= 0 {
        tracing::warn!("Callback query missing valid telegram_id; aborting nav handler");
        return Ok(());
    }

    answer_callback_query_timeout(&bot, &q.id).await?;

    let action = trios_mb_tg::navigation::NavigationRouter::parse_callback(&data);
    let chat_id = match q.chat_id() {
        Some(id) => id,
        None => return Ok(()),
    };

    let lang = load_lang_by_id(&db, tid).await;

    match action {
        Some(trios_mb_tg::navigation::NavigationAction::Back) => {
            dialogue_update_timeout(&dialogue, Scene::MainMenu).await?;
            send_message_timeout(&bot, chat_id, trios_mb_i18n::t(lang, "main_menu"), Some(main_menu_keyboard(lang).into())).await?;
        }
        Some(trios_mb_tg::navigation::NavigationAction::Cancel) => {
            dialogue_exit_timeout(&dialogue).await?;
            send_message_timeout(&bot, chat_id, trios_mb_i18n::t(lang, "main_menu"), Some(main_menu_keyboard(lang).into())).await?;
        }
        Some(trios_mb_tg::navigation::NavigationAction::Navigate(scene_id)) => {
            let scene = scene_from_id(&scene_id);
            dialogue_update_timeout(&dialogue, scene).await?;
            enter_scene_greeting(&bot, chat_id, lang, &scene_id, &db, tid).await?;
        }
        None => {}
    }
    Ok(())
}

#[tracing::instrument(skip_all)]
async fn handle_main_menu_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let tid = msg.from.as_ref().map(|u| u.id.0 as i64).unwrap_or(0);
    if tid == 0 {
        tracing::warn!("Missing telegram_id; aborting main menu handler");
        return Ok(());
    }

    let lang = load_lang(&db, &msg).await;
    let text = match msg.text() {
        Some(t) => t,
        None => {
            send_message_timeout(&bot, msg.chat.id, trios_mb_i18n::t(lang, "main_menu"), Some(main_menu_keyboard(lang).into())).await?;
            return Ok(());
        }
    };

    let target = match_text_to_scene(lang, text);
    match target {
        Some(id) => {
            let scene = scene_from_id(&id);
            dialogue_update_timeout(&dialogue, scene).await?;
            enter_scene_greeting(&bot, msg.chat.id, lang, &id, &db, tid).await?;
        }
        None => {
            send_message_timeout(&bot, msg.chat.id, trios_mb_i18n::t(lang, "main_menu"), Some(main_menu_keyboard(lang).into())).await?;
        }
    }
    Ok(())
}

fn match_text_to_scene(lang: trios_mb_types::user::Language, text: &str) -> Option<trios_mb_types::scene::SceneId> {
    use trios_mb_types::scene::SceneId;
    use trios_mb_tg::navigation::match_item_text;
    match_item_text(text).or_else(|| {
        if text == trios_mb_i18n::t(lang, "generate_photo") {
            return Some(SceneId::NeuroPhoto);
        }
        if text == trios_mb_i18n::t(lang, "generate_video") {
            return Some(SceneId::TextToVideo);
        }
        if text == trios_mb_i18n::t(lang, "balance") {
            return Some(SceneId::CheckBalance);
        }
        if text == trios_mb_i18n::t(lang, "top_up") {
            return Some(SceneId::Payment);
        }
        if text == trios_mb_i18n::t(lang, "settings") {
            return Some(SceneId::ChangeLanguage);
        }
        if text == trios_mb_i18n::t(lang, "help") {
            return Some(SceneId::Help);
        }
        None
    })
}

#[tracing::instrument(skip_all)]
async fn handle_help_state_msg(
    _bot: teloxide::Bot,
    _db: Arc<dyn Database>,
    dialogue: MyDialogue,
    _msg: Message,
) -> HandlerResult {
    dialogue_update_timeout(&dialogue, Scene::MainMenu).await?;
    Ok(())
}

#[tracing::instrument(skip_all)]
async fn handle_balance_state_msg(
    bot: teloxide::Bot,
    db: Arc<dyn Database>,
    dialogue: MyDialogue,
    msg: Message,
) -> HandlerResult {
    let lang = load_lang(&db, &msg).await;
    send_message_timeout(&bot, msg.chat.id, trios_mb_i18n::t(lang, "main_menu"), Some(main_menu_keyboard(lang).into())).await?;
    dialogue_update_timeout(&dialogue, Scene::MainMenu).await?;
    Ok(())
}

fn scene_from_id(id: &trios_mb_types::scene::SceneId) -> Scene {
    use trios_mb_types::scene::SceneId;
    match id {
        SceneId::Start | SceneId::Menu => Scene::MainMenu,
        SceneId::Help => Scene::Help,
        SceneId::TechSupport => Scene::MainMenu,
        SceneId::CheckBalance | SceneId::Balance => Scene::Balance,
        SceneId::ChangeLanguage => Scene::MainMenu,
        SceneId::CreateUser => Scene::MainMenu,
        SceneId::SubscriptionCheck => Scene::MainMenu,
        SceneId::NeuroPhoto => Scene::NeuroPhoto(trios_mb_tg::state::NeuroPhotoState::default()),
        SceneId::NeuroPhotoV2 => Scene::NeuroPhotoV2(trios_mb_tg::state::NeuroPhotoState::default()),
        SceneId::TextToImage => Scene::TextToImage(trios_mb_tg::state::TextToImageState::default()),
        SceneId::TextToVideo => Scene::TextToVideo(trios_mb_tg::state::TextToVideoState::default()),
        SceneId::ImageToVideo => Scene::ImageToVideo(trios_mb_tg::state::ImageToVideoState::default()),
        SceneId::ImageToPrompt => Scene::ImageToPrompt(trios_mb_tg::state::ImageToPromptState::default()),
        SceneId::ImageUpscaler => Scene::ImageUpscaler(trios_mb_tg::state::UpscalerState::default()),
        SceneId::AiPhotoshop => Scene::AiPhotoshop(trios_mb_tg::state::AiPhotoshopState::default()),
        SceneId::FluxKontext => Scene::FluxKontext(trios_mb_tg::state::FluxKontextState::default()),
        SceneId::LipSync => Scene::LipSync(trios_mb_tg::state::LipSyncState::default()),
        SceneId::FaceSwap => Scene::FaceSwap(trios_mb_tg::state::FaceSwapState::default()),
        SceneId::Morphing => Scene::Morphing(trios_mb_tg::state::MorphingState::default()),
        SceneId::TextToSpeech => Scene::TextToSpeech(trios_mb_tg::state::TextToSpeechState::default()),
        SceneId::VideoTranscription => Scene::VideoTranscription(trios_mb_tg::state::VideoTranscriptionState::default()),
        SceneId::AiCover => Scene::AiCover(trios_mb_tg::state::AiCoverState::default()),
        SceneId::MusicGeneration => Scene::MusicGeneration(trios_mb_tg::state::MusicGenerationState::default()),
        SceneId::VoiceTraining => Scene::VoiceTraining(trios_mb_tg::state::VoiceTrainingState::default()),
        SceneId::VoiceAvatar => Scene::VoiceAvatar(trios_mb_tg::state::VoiceAvatarState::default()),
        SceneId::AvatarTransform => Scene::AvatarTransform(trios_mb_tg::state::AvatarTransformState::default()),
        SceneId::AvatarBrain => Scene::AvatarBrain(trios_mb_tg::state::AvatarBrainState::default()),
        SceneId::ChatWithAvatar => Scene::ChatWithAvatar(trios_mb_tg::state::ChatWithAvatarState::default()),
        SceneId::DigitalAvatarBody | SceneId::DigitalAvatarBodyV2 => Scene::DigitalAvatarBody(trios_mb_tg::state::DigitalAvatarBodyState::default()),
        SceneId::Payment => Scene::Payment(trios_mb_tg::state::PaymentFlowState::default()),
        SceneId::StarPayment => Scene::StarPayment(trios_mb_tg::state::PaymentFlowState::default()),
        SceneId::RublePayment => Scene::RublePayment(trios_mb_tg::state::PaymentFlowState::default()),
        SceneId::CryptoPayment => Scene::CryptoPayment(trios_mb_tg::state::PaymentFlowState::default()),
        SceneId::TonPayment => Scene::TonPayment(trios_mb_tg::state::PaymentFlowState::default()),
        SceneId::TonNativePayment => Scene::TonNativePayment(trios_mb_tg::state::PaymentFlowState::default()),
        SceneId::Subscription => Scene::MainMenu,
        SceneId::GetRuBill => Scene::MainMenu,
        SceneId::SelectModel => Scene::SelectModel(trios_mb_tg::state::SelectModelState::default()),
        SceneId::ImprovePrompt => Scene::ImprovePrompt(trios_mb_tg::state::ImprovePromptState::default()),
        SceneId::Size => Scene::Size(trios_mb_tg::state::SizeState::default()),
        SceneId::TrainFluxModel => Scene::TrainFluxModel(trios_mb_tg::state::TrainFluxModelState::default()),
        SceneId::UploadTrainFluxModel => Scene::TrainFluxModel(trios_mb_tg::state::TrainFluxModelState::default()),
        SceneId::InstagramScraping => Scene::InstagramScraping(trios_mb_tg::state::InstagramScrapingState::default()),
        SceneId::InstagramParser | SceneId::InstagramParserWizard => Scene::InstagramParser(trios_mb_tg::state::InstagramParserState::default()),
        SceneId::Invite => Scene::Invite,
        SceneId::Email => Scene::Email(trios_mb_tg::state::EmailState::default()),
        SceneId::CancelPredictions => Scene::MainMenu,
        SceneId::NeuroCoder => Scene::NeuroCoder(trios_mb_tg::state::NeuroCoderState::default()),
        SceneId::VideoDuration => Scene::VideoDuration(trios_mb_tg::state::VideoDurationState::default()),
        SceneId::AiReelsEntry | SceneId::AiReels => Scene::AiReels(trios_mb_tg::state::AiReelsState::default()),
        SceneId::AiReelsRender => Scene::AiReels(trios_mb_tg::state::AiReelsState::default()),
        SceneId::HedraRender => Scene::HedraRender(trios_mb_tg::state::HedraRenderState::default()),
        SceneId::HeygenRender => Scene::HeygenRender(trios_mb_tg::state::HeygenRenderState::default()),
        SceneId::FalRender => Scene::FalRender(trios_mb_tg::state::FalRenderState::default()),
        SceneId::RemoveBg => Scene::RemoveBg(trios_mb_tg::state::RemoveBgState::default()),
    }
}

#[tracing::instrument(skip(bot, db), fields(scene = ?scene_id, telegram_id))]
async fn enter_scene_greeting(
    bot: &teloxide::Bot,
    chat_id: ChatId,
    lang: trios_mb_types::user::Language,
    scene_id: &trios_mb_types::scene::SceneId,
    db: &Arc<dyn Database>,
    telegram_id: i64,
) -> HandlerResult {
    use trios_mb_types::scene::SceneId;
    match scene_id {
        SceneId::NeuroPhoto | SceneId::NeuroPhotoV2 => {
            send_message_timeout(&bot, chat_id, trios_mb_i18n::t(lang, "send_photo"), None).await?;
        }
        SceneId::TextToImage | SceneId::TextToVideo => {
            send_message_timeout(&bot, chat_id, trios_mb_i18n::t(lang, "send_text"), None).await?;
        }
        SceneId::LipSync => {
            let text = if lang.is_russian() { "🎤 Отправьте видео для LipSync" } else { "🎤 Send a video for LipSync" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::ImageToVideo => {
            let text = if lang.is_russian() { "🎥 Выберите модель и формат видео:" } else { "🎥 Choose model and video format:" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::Payment | SceneId::StarPayment | SceneId::RublePayment
        | SceneId::CryptoPayment | SceneId::TonPayment | SceneId::TonNativePayment => {
            send_message_timeout(&bot, chat_id, trios_mb_i18n::t(lang, "top_up"), None).await?;
        }
        SceneId::CheckBalance | SceneId::Balance => {
            let balance = match db.get_balance(telegram_id).await {
                Ok(b) => b,
                Err(e) => {
                    tracing::error!(telegram_id, error = %e, "Failed to get balance in handler");
                    let err = if lang.is_russian() {
                        "❌ Не удалось получить баланс. Попробуйте позже.".to_string()
                    } else {
                        "❌ Could not retrieve balance. Please try again later.".to_string()
                    };
                    send_message_timeout(&bot, chat_id, err, None).await?;
                    return Ok(());
                }
            };
            let text = if lang.is_russian() {
                format!("💰 Ваш баланс: {:.2} ₽", balance)
            } else {
                format!("💰 Your balance: {:.2}", balance)
            };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::FaceSwap => {
            let text = if lang.is_russian() { "🎭 Отправьте фото для замены лица" } else { "🎭 Send a photo for face swap" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::Morphing => {
            let text = if lang.is_russian() { "🌀 Отправьте изображения для морфинга" } else { "🌀 Send images for morphing" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::TextToSpeech => {
            let text = if lang.is_russian() { "🎙️ Отправьте текст для озвучки" } else { "🎙️ Send text for speech" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::VideoTranscription => {
            let text = if lang.is_russian() { "📺 Отправьте видео" } else { "📺 Send a video" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::MusicGeneration => {
            let text = if lang.is_russian() { "🎵 Опишите музыку" } else { "🎵 Describe music" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::VoiceAvatar => {
            let text = if lang.is_russian() { "🎙️ Отправьте голосовое сообщение" } else { "🎙️ Send a voice message" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::VoiceTraining => {
            let text = if lang.is_russian() { "🎤 Отправьте аудио для обучения" } else { "🎤 Send audio for training" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::AiCover => {
            let text = if lang.is_russian() { "🎧 Отправьте песню для AI Cover" } else { "🎧 Send a song for AI Cover" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::AvatarTransform => {
            let text = if lang.is_russian() { "🦸 Выберите супергероя" } else { "🦸 Choose a superhero" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::AvatarBrain => {
            let text = if lang.is_russian() { "🧠 Введите название компании" } else { "🧠 Enter company name" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::ChatWithAvatar => {
            let text = if lang.is_russian() { "💭 Напишите сообщение аватару" } else { "💭 Write to avatar" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::DigitalAvatarBody | SceneId::DigitalAvatarBodyV2 => {
            let text = if lang.is_russian() { "🤖 Выберите стиль тела" } else { "🤖 Choose body style" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::SelectModel => {
            let text = if lang.is_russian() { "🤖 Выберите модель" } else { "🤖 Select model" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::ImprovePrompt => {
            let text = if lang.is_russian() { "✨ Отправьте промпт" } else { "✨ Send prompt" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::TrainFluxModel => {
            let text = if lang.is_russian() { "🔥 Отправьте изображения для обучения" } else { "🔥 Send training images" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::ImageToPrompt => {
            let text = if lang.is_russian() { "🖼️ Отправьте изображение" } else { "🖼️ Send an image" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::ImageUpscaler => {
            let text = if lang.is_russian() { "⬆️ Отправьте фото" } else { "⬆️ Send a photo" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::FluxKontext => {
            let text = if lang.is_russian() { "🎨 FLUX Kontext" } else { "🎨 FLUX Kontext" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::Email => {
            let text = if lang.is_russian() { "📧 Введите email" } else { "📧 Enter email" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::Invite => {
            let text = match db.get_referral_count(telegram_id).await {
                Ok(ref_count) => {
                    if lang.is_russian() {
                        format!("👥 Рефералов: {}", ref_count)
                    } else {
                        format!("👥 Referrals: {}", ref_count)
                    }
                }
                Err(e) => {
                    tracing::error!(error = %e, telegram_id, "Failed to load referral count");
                    if lang.is_russian() {
                        "❌ Не удалось загрузить количество рефералов. Попробуйте позже.".to_string()
                    } else {
                        "❌ Unable to load referral count. Please try again later.".to_string()
                    }
                }
            };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::AiPhotoshop => {
            let text = if lang.is_russian() { "🎨 AI Photoshop — отправьте изображение" } else { "🎨 AI Photoshop — send an image" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::HedraRender => {
            let text = if lang.is_russian() { "🎬 Hedra — отправьте изображение" } else { "🎬 Hedra — send an image" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::HeygenRender => {
            let text = if lang.is_russian() { "🎥 HeyGen — введите ID аватара" } else { "🎥 HeyGen — enter avatar ID" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::FalRender => {
            let text = if lang.is_russian() { "⚡ Fal.ai — введите промпт" } else { "⚡ Fal.ai — enter prompt" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::RemoveBg => {
            let text = if lang.is_russian() { "🖼️ Удалить фон — отправьте фото" } else { "🖼️ Remove BG — send a photo" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::AiReelsEntry | SceneId::AiReels | SceneId::AiReelsRender => {
            let text = if lang.is_russian() { "🎬 AI Reels — опишите видео" } else { "🎬 AI Reels — describe the video" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::Size => {
            let text = if lang.is_russian() { "📐 Выберите размер" } else { "📐 Select size" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::VideoDuration => {
            let text = if lang.is_russian() { "⏱️ Выберите длительность" } else { "⏱️ Select duration" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::InstagramScraping => {
            let text = if lang.is_russian() { "🔍 Парсинг Instagram\n\nОтправьте ссылку на Instagram профиль:" } else { "🔍 Instagram Scraping\n\nSend an Instagram profile link:" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::InstagramParser | SceneId::InstagramParserWizard => {
            let text = if lang.is_russian() { "📊 Парсер Instagram\n\nОтправьте ссылку на профиль для анализа:" } else { "📊 Instagram Parser\n\nSend a profile link for analysis:" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::NeuroCoder => {
            let text = if lang.is_russian() { "💻 Нейро Кодер\n\nОпишите задачу для генерации кода:" } else { "💻 Neuro Coder\n\nDescribe the code generation task:" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        SceneId::TechSupport => {
            let text = if lang.is_russian() { "🛠️ Техподдержка\n\nОпишите вашу проблему:" } else { "🛠️ Tech Support\n\nDescribe your issue:" };
            send_message_timeout(&bot, chat_id, text, None).await?;
        }
        _ => {
            send_message_timeout(&bot, chat_id, trios_mb_i18n::t(lang, "main_menu"), Some(main_menu_keyboard(lang).into())).await?;
        }
    }
    Ok(())
}
