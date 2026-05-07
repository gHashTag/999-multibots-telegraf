pub const SUPER_ADMIN_ID: i64 = 144022504;

pub const HAIM_GROUP_STAFF_IDS: &[i64] = &[
    144022504,
    289259562,
    752224685,
    7669741878,
    1036512726,
];

pub const METAMUSE_STAFF_IDS: &[i64] = &[
    144022504,
    352374518,
    1064902106,
    737300586,
    447979523,
];

pub fn is_super_admin(user_id: i64) -> bool {
    user_id == SUPER_ADMIN_ID
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

    #[test]
    fn super_admin_check() {
        assert!(is_super_admin(SUPER_ADMIN_ID));
        assert!(!is_super_admin(0));
    }

    #[test]
    fn admin_includes_super_admin() {
        assert!(is_admin(SUPER_ADMIN_ID));
    }

    #[test]
    fn admin_includes_haim_staff() {
        assert!(is_admin(289259562));
    }

    #[test]
    fn admin_includes_metamuse_staff() {
        assert!(is_admin(352374518));
    }

    #[test]
    fn non_admin_user() {
        assert!(!is_admin(999999));
    }

    #[test]
    fn staff_check() {
        assert!(is_staff(289259562));
        assert!(is_staff(352374518));
        assert!(!is_staff(999999));
    }

    #[test]
    fn parsing_access_super_admin() {
        assert!(has_parsing_access(SUPER_ADMIN_ID, "AnyBot"));
    }

    #[test]
    fn parsing_access_haim_bot() {
        assert!(has_parsing_access(289259562, "HaimGroupMedia_bot"));
        assert!(!has_parsing_access(352374518, "HaimGroupMedia_bot"));
    }

    #[test]
    fn parsing_access_metamuse_bot() {
        assert!(has_parsing_access(352374518, "MetaMuse_Manifest_bot"));
        assert!(!has_parsing_access(289259562, "MetaMuse_Manifest_bot"));
    }

    #[test]
    fn parsing_access_unknown_bot() {
        assert!(!has_parsing_access(289259562, "UnknownBot"));
    }
}
