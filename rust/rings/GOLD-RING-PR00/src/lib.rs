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

/// Deserialize a `Vec<T>` and enforce a maximum element count.
pub fn deserialize_vec_max_100<'de, D, T>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    let vec = Vec::<T>::deserialize(deserializer)?;
    if vec.len() > 100 {
        Err(serde::de::Error::custom("vec exceeds maximum length of 100"))
    } else {
        Ok(vec)
    }
}

/// Deserialize an `Option<Vec<T>>` and enforce a maximum element count.
pub fn deserialize_option_vec_max_100<'de, D, T>(deserializer: D) -> Result<Option<Vec<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    let opt = Option::<Vec<T>>::deserialize(deserializer)?;
    if let Some(ref vec) = opt {
        if vec.len() > 100 {
            return Err(serde::de::Error::custom("vec exceeds maximum length of 100"));
        }
    }
    Ok(opt)
}

/// Deserialize an `Option<Vec<String>>` and enforce both a maximum element count (100)
/// and a maximum byte length per element (4096).
pub fn deserialize_option_vec_string_max_100_len_4096<'de, D>(
    deserializer: D,
) -> Result<Option<Vec<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    let opt = Option::<Vec<String>>::deserialize(deserializer)?;
    if let Some(ref vec) = opt {
        if vec.len() > 100 {
            return Err(serde::de::Error::custom("vec exceeds maximum length of 100"));
        }
        for s in vec {
            if s.len() > 4096 {
                return Err(serde::de::Error::custom(
                    "string exceeds maximum length of 4096",
                ));
            }
        }
    }
    Ok(opt)
}

pub mod fal;
pub mod infisical;
pub mod kie;
pub mod openai;
pub mod payment;
pub mod providers;
pub mod replicate;
pub mod telegram;

pub use telegram::*;
