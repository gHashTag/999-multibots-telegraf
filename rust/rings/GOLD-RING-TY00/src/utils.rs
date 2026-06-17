/// Truncate a string to `max` UTF-8 characters for safe logging.
/// Prevents log injection / buffer overflow from attacker-controlled strings.
pub fn truncate_for_log(s: &str, max: usize) -> &str {
    if s.chars().count() <= max {
        s
    } else {
        let idx = s.char_indices().nth(max).map(|(i, _)| i).unwrap_or(s.len());
        &s[..idx]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_truncate_short() {
        assert_eq!(truncate_for_log("hello", 10), "hello");
    }

    #[test]
    fn test_truncate_exact() {
        assert_eq!(truncate_for_log("hello", 5), "hello");
    }

    #[test]
    fn test_truncate_long() {
        assert_eq!(truncate_for_log("hello world", 5), "hello");
    }

    #[test]
    fn test_truncate_unicode() {
        assert_eq!(truncate_for_log("你好世界", 2), "你好");
    }
}
