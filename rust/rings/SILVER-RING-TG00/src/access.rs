use std::sync::LazyLock;

/// Load a mandatory i64 from an environment variable.
/// Logs an error and returns a sentinel value (0) if the variable is missing or invalid,
/// preventing a runtime panic while still allowing the bot to start.
fn load_mandatory_i64(env_var: &str) -> i64 {
    let raw = match std::env::var(env_var) {
        Ok(v) => v,
        Err(_) => {
            tracing::error!("{} environment variable is required but not set; defaulting to 0", env_var);
            return 0;
        }
    };
    match raw.parse::<i64>() {
        Ok(v) => v,
        Err(_) => {
            tracing::error!("{}='{}' is not a valid i64; defaulting to 0", env_var, raw);
            0
        }
    }
}

/// Load an optional comma-separated list of i64s from an environment variable.
/// Returns an empty Vec if the variable is unset or empty.
/// Skips invalid integers with a warning instead of panicking.
fn load_optional_id_list(env_var: &str) -> Vec<i64> {
    match std::env::var(env_var) {
        Ok(raw) if !raw.is_empty() => raw
            .split(',')
            .filter_map(|s| {
                let trimmed = s.trim();
                match trimmed.parse::<i64>() {
                    Ok(v) => Some(v),
                    Err(_) => {
                        tracing::warn!("{} contains invalid integer: '{}'; skipping", env_var, trimmed);
                        None
                    }
                }
            })
            .collect(),
        _ => Vec::new(),
    }
}

pub static SUPER_ADMIN_ID: LazyLock<i64> = LazyLock::new(|| load_mandatory_i64("SUPER_ADMIN_ID"));

pub static HAIM_GROUP_STAFF_IDS: LazyLock<Vec<i64>> =
    LazyLock::new(|| load_optional_id_list("HAIM_GROUP_STAFF_IDS"));

pub static METAMUSE_STAFF_IDS: LazyLock<Vec<i64>> =
    LazyLock::new(|| load_optional_id_list("METAMUSE_STAFF_IDS"));

/// Sentinel value used when SUPER_ADMIN_ID env var is missing or invalid.
const SUPER_ADMIN_SENTINEL: i64 = 0;

pub fn is_super_admin(user_id: i64) -> bool {
    // Reject the sentinel explicitly: even though no real Telegram user has ID 0,
    // defense-in-depth mandates that the fallback value never grant privileges.
    if user_id == SUPER_ADMIN_SENTINEL {
        return false;
    }
    user_id == *SUPER_ADMIN_ID
}

pub fn is_admin(user_id: i64) -> bool {
    if user_id == SUPER_ADMIN_SENTINEL {
        return false;
    }
    is_super_admin(user_id)
        || HAIM_GROUP_STAFF_IDS.contains(&user_id)
        || METAMUSE_STAFF_IDS.contains(&user_id)
}

pub fn is_staff(user_id: i64) -> bool {
    if user_id == SUPER_ADMIN_SENTINEL {
        return false;
    }
    HAIM_GROUP_STAFF_IDS.contains(&user_id) || METAMUSE_STAFF_IDS.contains(&user_id)
}

pub fn is_haim_group_staff(user_id: i64) -> bool {
    HAIM_GROUP_STAFF_IDS.contains(&user_id)
}

pub fn is_metamuse_staff(user_id: i64) -> bool {
    METAMUSE_STAFF_IDS.contains(&user_id)
}

fn load_bot_name(env_var: &str, fallback: &str) -> String {
    match std::env::var(env_var) {
        Ok(v) if !v.is_empty() => v,
        Ok(_) => {
            tracing::warn!("{} is empty; falling back to hardcoded bot name", env_var);
            fallback.to_string()
        }
        Err(_) => {
            tracing::warn!("{} not set; falling back to hardcoded bot name", env_var);
            fallback.to_string()
        }
    }
}

pub static HAIM_GROUP_BOT_NAME: LazyLock<String> =
    LazyLock::new(|| load_bot_name("HAIM_GROUP_BOT_NAME", "HaimGroupMedia_bot"));

pub static METAMUSE_BOT_NAME: LazyLock<String> =
    LazyLock::new(|| load_bot_name("METAMUSE_BOT_NAME", "MetaMuse_Manifest_bot"));

pub fn has_parsing_access(user_id: i64, bot_name: &str) -> bool {
    if user_id == SUPER_ADMIN_SENTINEL {
        return false;
    }
    if is_super_admin(user_id) {
        return true;
    }
    match bot_name {
        n if n == HAIM_GROUP_BOT_NAME.as_str() => HAIM_GROUP_STAFF_IDS.contains(&user_id),
        n if n == METAMUSE_BOT_NAME.as_str() => METAMUSE_STAFF_IDS.contains(&user_id),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn setup_env() {
        env::set_var("SUPER_ADMIN_ID", "144022504");
        env::set_var("HAIM_GROUP_STAFF_IDS", "144022504,289259562,752224685,7669741878,1036512726");
        env::set_var("METAMUSE_STAFF_IDS", "144022504,352374518,1064902106,737300586,447979523");
        // Force LazyLock re-evaluation by creating new LazyLock instances is not possible,
        // but since these are static LazyLocks, the first test that accesses them will
        // initialize them. We need to set env vars BEFORE any test touches the statics.
    }

    #[test]
    fn super_admin_check() {
        setup_env();
        assert!(is_super_admin(*SUPER_ADMIN_ID));
        assert!(!is_super_admin(0));
    }

    #[test]
    fn admin_includes_super_admin() {
        setup_env();
        assert!(is_admin(*SUPER_ADMIN_ID));
    }

    #[test]
    fn admin_includes_haim_staff() {
        setup_env();
        assert!(is_admin(289259562));
    }

    #[test]
    fn admin_includes_metamuse_staff() {
        setup_env();
        assert!(is_admin(352374518));
    }

    #[test]
    fn non_admin_user() {
        setup_env();
        assert!(!is_admin(999999));
    }

    #[test]
    fn staff_check() {
        setup_env();
        assert!(is_staff(289259562));
        assert!(is_staff(352374518));
        assert!(!is_staff(999999));
    }

    #[test]
    fn parsing_access_super_admin() {
        setup_env();
        assert!(has_parsing_access(*SUPER_ADMIN_ID, "AnyBot"));
    }

    #[test]
    fn parsing_access_haim_bot() {
        setup_env();
        assert!(has_parsing_access(289259562, "HaimGroupMedia_bot"));
        assert!(!has_parsing_access(352374518, "HaimGroupMedia_bot"));
    }

    #[test]
    fn parsing_access_metamuse_bot() {
        setup_env();
        assert!(has_parsing_access(352374518, "MetaMuse_Manifest_bot"));
        assert!(!has_parsing_access(289259562, "MetaMuse_Manifest_bot"));
    }

    #[test]
    fn parsing_access_unknown_bot() {
        setup_env();
        assert!(!has_parsing_access(289259562, "UnknownBot"));
    }
}
