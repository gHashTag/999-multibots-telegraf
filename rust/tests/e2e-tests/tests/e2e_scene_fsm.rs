use trios_mb_tg::navigation::{NavigationAction, NavigationRouter};
use trios_mb_tg::registry::SceneRegistry;
use trios_mb_tg::state::Scene;
use trios_mb_types::scene::{AccessLevel, SceneCategory, SceneId, SceneStatus};
use trios_mb_types::user::Language;

#[test]
fn scene_default_is_main_menu() {
    let scene = Scene::default();
    assert_eq!(scene.scene_id(), SceneId::Menu);
}

#[test]
fn scene_id_variants_map_correctly() {
    assert_eq!(Scene::Help.scene_id(), SceneId::Help);
    assert_eq!(Scene::Balance.scene_id(), SceneId::Balance);
    assert_eq!(Scene::Invite.scene_id(), SceneId::Invite);
}

#[test]
fn navigation_router_enter_and_current() {
    let mut router = NavigationRouter::new();
    let chat_id = 42i64;

    assert!(router.current_scene(chat_id).is_none());

    router.enter(chat_id, SceneId::Menu);
    assert_eq!(router.current_scene(chat_id), Some(SceneId::Menu));

    router.enter(chat_id, SceneId::NeuroPhoto);
    assert_eq!(router.current_scene(chat_id), Some(SceneId::NeuroPhoto));
}

#[test]
fn navigation_router_go_back() {
    let mut router = NavigationRouter::new();
    let chat_id = 1i64;

    router.enter(chat_id, SceneId::Menu);
    router.enter(chat_id, SceneId::NeuroPhoto);
    router.enter(chat_id, SceneId::TextToImage);

    let back = router.go_back(chat_id);
    assert_eq!(back, Some(SceneId::NeuroPhoto));
    assert_eq!(router.current_scene(chat_id), Some(SceneId::NeuroPhoto));
}

#[test]
fn navigation_router_go_back_single_entry_returns_none() {
    let mut router = NavigationRouter::new();
    let chat_id = 2i64;

    router.enter(chat_id, SceneId::Menu);
    let back = router.go_back(chat_id);
    assert!(back.is_none());
}

#[test]
fn navigation_router_go_back_empty_returns_none() {
    let mut router = NavigationRouter::new();
    let back = router.go_back(99);
    assert!(back.is_none());
}

#[test]
fn navigation_router_clear() {
    let mut router = NavigationRouter::new();
    let chat_id = 3i64;

    router.enter(chat_id, SceneId::Menu);
    router.enter(chat_id, SceneId::Help);
    router.clear(chat_id);
    assert!(router.current_scene(chat_id).is_none());
}

#[test]
fn navigation_router_parse_callback_back() {
    let action = NavigationRouter::parse_callback("nav:back");
    assert!(matches!(action, Some(NavigationAction::Back)));
}

#[test]
fn navigation_router_parse_callback_cancel() {
    let action = NavigationRouter::parse_callback("nav:cancel");
    assert!(matches!(action, Some(NavigationAction::Cancel)));
}

#[test]
fn navigation_router_parse_callback_navigate() {
    let action = NavigationRouter::parse_callback("nav:neuroPhotoWizard");
    assert!(matches!(action, Some(NavigationAction::Navigate(SceneId::NeuroPhoto))));
}

#[test]
fn navigation_router_parse_callback_invalid() {
    assert!(NavigationRouter::parse_callback("invalid").is_none());
    assert!(NavigationRouter::parse_callback("nav:nonexistent").is_none());
}

#[test]
fn scene_registry_get_known_scene() {
    let registry = SceneRegistry::new();
    let meta = registry.get(&SceneId::Start);
    assert!(meta.is_some());
    let m = meta.unwrap();
    assert_eq!(m.category, SceneCategory::System);
    assert_eq!(m.access_level, AccessLevel::Public);
    assert_eq!(m.status, SceneStatus::Active);
}

#[test]
fn scene_registry_get_generation_scene() {
    let registry = SceneRegistry::new();
    let meta = registry.get(&SceneId::NeuroPhoto);
    assert!(meta.is_some());
    let m = meta.unwrap();
    assert_eq!(m.category, SceneCategory::Generation);
    assert_eq!(m.cost, Some(10));
}

#[test]
fn scene_registry_get_all_known_have_metadata() {
    let registry = SceneRegistry::new();
    assert!(registry.get(&SceneId::RemoveBg).is_some());
    assert!(registry.get(&SceneId::Start).is_some());
    assert!(registry.get(&SceneId::NeuroPhoto).is_some());
}

#[test]
fn scene_registry_by_category() {
    let registry = SceneRegistry::new();
    let system = registry.by_category(SceneCategory::System);
    assert!(!system.is_empty());
    for m in &system {
        assert_eq!(m.category, SceneCategory::System);
    }

    let payment = registry.by_category(SceneCategory::Payment);
    assert!(!payment.is_empty());
    for m in &payment {
        assert_eq!(m.category, SceneCategory::Payment);
    }
}

#[test]
fn scene_registry_check_access_public() {
    let registry = SceneRegistry::new();

    assert!(registry.check_access(&SceneId::Start, false, false));
    assert!(registry.check_access(&SceneId::Start, true, false));
    assert!(registry.check_access(&SceneId::Start, false, true));
}

#[test]
fn scene_registry_check_access_subscriber_scenes() {
    let registry = SceneRegistry::new();
    assert!(!registry.check_access(&SceneId::RemoveBg, false, false));
    assert!(registry.check_access(&SceneId::RemoveBg, true, false));
    assert!(registry.check_access(&SceneId::Morphing, true, false));
}

#[test]
fn keyboard_main_menu_returns_markup() {
    let kb = trios_mb_tg::keyboards::main_menu_keyboard(Language::Ru);
    let json = serde_json::to_value(&kb).unwrap();
    assert!(json.get("keyboard").is_some());
}

#[test]
fn keyboard_main_menu_en_returns_markup() {
    let kb = trios_mb_tg::keyboards::main_menu_keyboard(Language::En);
    let json = serde_json::to_value(&kb).unwrap();
    assert!(json.get("keyboard").is_some());
}

#[test]
fn keyboard_inline_single_returns_markup() {
    let kb = trios_mb_tg::keyboards::inline_single("Click me", "action_1");
    let json = serde_json::to_value(&kb).unwrap();
    assert!(json.get("inline_keyboard").is_some());
}

#[test]
fn keyboard_inline_with_back_returns_markup() {
    let kb = trios_mb_tg::keyboards::inline_with_back(vec![], Language::Ru);
    let json = serde_json::to_value(&kb).unwrap();
    assert!(json.get("inline_keyboard").is_some());
}
