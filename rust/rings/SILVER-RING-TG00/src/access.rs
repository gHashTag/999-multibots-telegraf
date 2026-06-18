use std::sync::LazyLock;

/// Load a mandatory i64 from an environment variable.
/// Panics at first access if the variable is missing or not a valid i64.
fn load_mandatory_i64(env_var: &str) -> i64 {
    let raw = std::env::var(env_var)
        .unwrap_or_else(|_| panic!("FATAL: {} environment variable is required but not set", env_var));
    raw.parse::<i64>()
        .unwrap_or_else(|_| panic!("FATAL: {}='{}' is not a valid i64", env_var, raw))
}

/// Load an optional comma-separated list of i64s from an environment variable.
/// Returns an empty Vec if the variable is unset or empty.
fn load_optional_id_list(env_var: &str) -> Vec<i64> {
    match std::env::var(env_var) {
        Ok(raw) if !raw.is_empty() => raw
            .split(',')
            .map(|s| s.trim().parse::<i64>().unwrap_or_else(|_| {
                panic!("FATAL: {} contains invalid integer: '{}'", env_var, s.trim())
            }))
            .collect(),
        _ => Vec::new(),
    }
}

pub static SUPER_ADMIN_ID: LazyLock<i64> = LazyLock::new(|| load_mandatory_i64("SUPER_ADMIN_ID"));

pub static HAIM_GROUP_STAFF_IDS: LazyLock<Vec<i64>> =
    LazyLock::new(|| load_optional_id_list("HAIM_GROUP_STAFF_IDS"));

pub static METAMUSE_STAFF_IDS: LazyLock<Vec<i64>> =
    LazyLock::new(|| load_optional_id_list("METAMUSE_STAFF_IDS"));

pub fn is_super_admin(user_id: i64) -> bool {
    user_id == *SUPER_ADMIN_ID
}

pub fn is_admin(user_id: i64) -> bool {
    is_super_admin(user_id)
        || HAIM_GROUP_STAFF_IDS.contains(&user_id)
        || METAMUSE_STAFF_IDS.contains(&user_id)
}

pub fn is_staff(user_id: i64) -> bool {
    HAIM_GROUP_STAFF_IDS.contains(&user_id) || METAMUSE_STAFF_IDS.contains(&user_id)
}

pub fn is_haim_group_staff(user_id: i64) -> bool {
    HAIM_GROUP_STAFF_IDS.contains(&user_id)
}

pub fn is_metamuse_staff(user_id: i64) -> bool {
    METAMUSE_STAFF_IDS.contains(&user_id)
}

pub fn has_parsing_access(user_id: i64, bot_name: &str) -> bool {
    if is_super_admin(user_id) {
        return true;
    }
    match bot_name {
        "HaimGroupMedia_bot" => HAIM_GROUP_STAFF_IDS.contains(&user_id),
        "MetaMuse_Manifest_bot" => METAMUSE_STAFF_IDS.contains(&user_id),
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
