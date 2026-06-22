#![allow(dead_code)]

use serde::{Deserialize, Deserializer};

/// Reject `NaN` and `Infinity` during f64 deserialization.
pub fn deserialize_finite_f64<'de, D>(deserializer: D) -> Result<f64, D::Error>
where
    D: Deserializer<'de>,
{
    let v = f64::deserialize(deserializer)?;
    if v.is_finite() {
        Ok(v)
    } else {
        Err(serde::de::Error::custom("value must be finite"))
    }
}

/// Reject `NaN` and `Infinity` during `Option<f64>` deserialization.
pub fn deserialize_option_finite_f64<'de, D>(deserializer: D) -> Result<Option<f64>, D::Error>
where
    D: Deserializer<'de>,
{
    let opt = Option::<f64>::deserialize(deserializer)?;
    if let Some(v) = opt {
        if v.is_finite() {
            Ok(Some(v))
        } else {
            Err(serde::de::Error::custom("value must be finite"))
        }
    } else {
        Ok(None)
    }
}

/// Deserialize a `String` and enforce a maximum byte length.
macro_rules! deserialize_string_max_len {
    ($name:ident, $limit:expr) => {
        pub fn $name<'de, D>(deserializer: D) -> Result<String, D::Error>
        where
            D: Deserializer<'de>,
        {
            let s = String::deserialize(deserializer)?;
            if s.len() > $limit {
                Err(serde::de::Error::custom(concat!(
                    "string exceeds maximum length of ",
                    stringify!($limit)
                )))
            } else {
                Ok(s)
            }
        }
    };
}

deserialize_string_max_len!(deserialize_string_max_4096, 4096);
deserialize_string_max_len!(deserialize_string_max_1024, 1024);
deserialize_string_max_len!(deserialize_string_max_256, 256);

/// Deserialize an `Option<String>` and enforce a maximum byte length when present.
macro_rules! deserialize_option_string_max_len {
    ($name:ident, $limit:expr) => {
        pub fn $name<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
        where
            D: Deserializer<'de>,
        {
            let opt = Option::<String>::deserialize(deserializer)?;
            if let Some(ref s) = opt {
                if s.len() > $limit {
                    return Err(serde::de::Error::custom(concat!(
                        "string exceeds maximum length of ",
                        stringify!($limit)
                    )));
                }
            }
            Ok(opt)
        }
    };
}

deserialize_option_string_max_len!(deserialize_option_string_max_4096, 4096);
deserialize_option_string_max_len!(deserialize_option_string_max_1024, 1024);
deserialize_option_string_max_len!(deserialize_option_string_max_256, 256);

pub mod fal;
pub mod infisical;
pub mod kie;
pub mod openai;
pub mod payment;
pub mod providers;
pub mod replicate;
pub mod telegram;

pub use telegram::*;
