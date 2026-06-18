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

/// Validate a result URL before storing it in the database.
/// Only allows `http://` or `https://` pointing to public hosts.
/// Rejects empty URLs, overly long URLs, embedded credentials,
/// loopback addresses, private IPv4/IPv6, link-local, and ULA addresses.
pub fn validate_result_url(url_str: &str) -> Result<(), String> {
    const MAX_URL_LEN: usize = 4096;
    if url_str.is_empty() {
        return Err("URL is empty".to_string());
    }
    if url_str.len() > MAX_URL_LEN {
        return Err(format!("URL exceeds maximum length of {} bytes", MAX_URL_LEN));
    }

    let parsed = url::Url::parse(url_str).map_err(|e| format!("Invalid URL: {}", e))?;

    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("URL must use http or https scheme".to_string()),
    }

    // Reject embedded credentials
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("URL contains embedded credentials".to_string());
    }

    if let Some(host) = parsed.host_str() {
        let lower = host.to_lowercase();
        if lower == "localhost" {
            return Err("URL points to localhost".to_string());
        }
        if let Ok(ip) = lower.parse::<std::net::IpAddr>() {
            if ip.is_loopback() {
                return Err("URL points to a loopback address".to_string());
            }
            match ip {
                std::net::IpAddr::V4(v4) => {
                    if v4.is_private() || v4.is_link_local() {
                        return Err("URL points to a private or link-local address".to_string());
                    }
                }
                std::net::IpAddr::V6(v6) => {
                    let segments = v6.segments();
                    // IPv6 ULA fc00::/7
                    if (segments[0] & 0xfe00) == 0xfc00 {
                        return Err("URL points to an IPv6 ULA address".to_string());
                    }
                    // IPv6 link-local fe80::/10
                    if (segments[0] & 0xffc0) == 0xfe80 {
                        return Err("URL points to an IPv6 link-local address".to_string());
                    }
                }
            }
        }
    } else {
        return Err("URL has no host".to_string());
    }

    Ok(())
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
