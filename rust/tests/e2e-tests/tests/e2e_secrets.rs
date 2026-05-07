use std::collections::HashMap;
use trios_mb_traits::SecretStore;
use trios_mb_types::AppError;
use trios_mb_test_utils::MockSecretStore;

#[tokio::test]
async fn get_returns_stored_secret() {
    let mut secrets = HashMap::new();
    secrets.insert("API_KEY".to_string(), "secret123".to_string());
    let store = MockSecretStore::new(secrets);

    let val = store.get("API_KEY").await.unwrap();
    assert_eq!(val, "secret123");
}

#[tokio::test]
async fn get_returns_error_for_missing_key() {
    let store = MockSecretStore::empty();

    let result = store.get("NONEXISTENT").await;
    assert!(result.is_err());
    match result {
        Err(AppError::Secrets(_)) => {}
        _ => panic!("Expected SecretsError"),
    }
}

#[tokio::test]
async fn get_all_returns_subset() {
    let mut secrets = HashMap::new();
    secrets.insert("KEY_A".to_string(), "val_a".to_string());
    secrets.insert("KEY_B".to_string(), "val_b".to_string());
    secrets.insert("KEY_C".to_string(), "val_c".to_string());
    let store = MockSecretStore::new(secrets);

    let result = store.get_all(&["KEY_A", "KEY_C", "KEY_MISSING"]).await.unwrap();
    assert_eq!(result.len(), 2);
    assert_eq!(result["KEY_A"], "val_a");
    assert_eq!(result["KEY_C"], "val_c");
}

#[tokio::test]
async fn reload_increments_counter() {
    let store = MockSecretStore::empty();

    assert_eq!(store.reload_count().await, 0);
    store.reload().await.unwrap();
    assert_eq!(store.reload_count().await, 1);
    store.reload().await.unwrap();
    assert_eq!(store.reload_count().await, 2);
}

#[tokio::test]
async fn health_check_returns_true() {
    let store = MockSecretStore::empty();

    let healthy = store.health_check().await.unwrap();
    assert!(healthy);
}
