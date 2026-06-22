use serde::{Deserialize, Serialize};
use std::fmt;

/// Money represented as i64 minor units (e.g. cents × 100).
/// All arithmetic is checked to prevent silent overflow.
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(into = "String", try_from = "String")]
pub struct Money(i64);

impl Money {
    /// Zero money.
    pub const ZERO: Self = Self(0);

    /// Maximum representable value.
    pub const MAX: Self = Self(i64::MAX);

    /// Create Money from a finite, non-negative f64 value.
    /// Returns None for NaN, Inf, negative values, or values that overflow i64.
    pub fn from_f64(value: f64) -> Option<Self> {
        if !value.is_finite() || value < 0.0 {
            return None;
        }
        // Multiply by 100 to convert to minor units, rounding to nearest cent.
        // Using f64::round avoids floor bias.
        let scaled = (value * 100.0).round();
        // Check that the scaled value fits in i64.
        if scaled > i64::MAX as f64 || scaled < i64::MIN as f64 {
            return None;
        }
        Some(Self(scaled as i64))
    }

    /// Convert back to f64 for gateway APIs that still require it.
    /// This is a lossy conversion (precision limited to cents).
    pub fn to_f64(self) -> f64 {
        self.0 as f64 / 100.0
    }

    /// Raw minor units accessor.
    pub fn minor_units(self) -> i64 {
        self.0
    }

    /// Checked addition.
    pub fn checked_add(self, rhs: Self) -> Option<Self> {
        self.0.checked_add(rhs.0).map(Self)
    }

    /// Checked subtraction (allows negative results).
    pub fn checked_sub(self, rhs: Self) -> Option<Self> {
        self.0.checked_sub(rhs.0).map(Self)
    }

    /// Checked multiplication by an integer scalar.
    pub fn checked_mul(self, rhs: i64) -> Option<Self> {
        self.0.checked_mul(rhs).map(Self)
    }

    /// Checked integer division.
    pub fn checked_div(self, rhs: i64) -> Option<Self> {
        if rhs == 0 {
            return None;
        }
        self.0.checked_div(rhs).map(Self)
    }
}

impl fmt::Display for Money {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let major = self.0.abs() / 100;
        let minor = self.0.abs() % 100;
        if self.0 < 0 {
            write!(f, "-{}.{:02}", major, minor)
        } else {
            write!(f, "{}.{:02}", major, minor)
        }
    }
}

impl fmt::Debug for Money {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Money")
            .field("amount", &"REDACTED")
            .finish()
    }
}

impl From<Money> for String {
    fn from(m: Money) -> Self {
        m.to_string()
    }
}

impl std::str::FromStr for Money {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let parts: Vec<&str> = s.split('.').collect();
        if parts.is_empty() || parts.len() > 2 {
            return Err(format!("Invalid money format: {}", s));
        }
        let major: i64 = parts[0]
            .parse()
            .map_err(|e| format!("Invalid major units: {}: {}", parts[0], e))?;
        let minor: i64 = if parts.len() == 2 {
            let frac = parts[1];
            if frac.len() > 2 {
                return Err(format!("Too many decimal places: {}", s));
            }
            let padded = format!("{:0<2}", frac);
            padded
                .parse()
                .map_err(|e| format!("Invalid minor units: {}: {}", frac, e))?
        } else {
            0
        };
        let value = major
            .checked_mul(100)
            .and_then(|v| v.checked_add(minor))
            .ok_or_else(|| "Money value overflow".to_string())?;
        Ok(Self(value))
    }
}

impl TryFrom<String> for Money {
    type Error = String;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        value.parse()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn money_from_f64_basic() {
        assert_eq!(Money::from_f64(1.23).unwrap().minor_units(), 123);
        assert_eq!(Money::from_f64(0.0).unwrap().minor_units(), 0);
        assert_eq!(Money::from_f64(100.99).unwrap().minor_units(), 10099);
    }

    #[test]
    fn money_from_f64_rejects_invalid() {
        assert!(Money::from_f64(f64::NAN).is_none());
        assert!(Money::from_f64(f64::INFINITY).is_none());
        assert!(Money::from_f64(f64::NEG_INFINITY).is_none());
        assert!(Money::from_f64(-1.0).is_none());
    }

    #[test]
    fn money_checked_arithmetic() {
        let a = Money::from_f64(10.0).unwrap();
        let b = Money::from_f64(3.50).unwrap();
        assert_eq!(a.checked_add(b).unwrap().to_f64(), 13.50);
        assert_eq!(a.checked_sub(b).unwrap().to_f64(), 6.50);
        assert_eq!(a.checked_mul(2).unwrap().to_f64(), 20.0);
        assert_eq!(a.checked_div(4).unwrap().to_f64(), 2.50);
    }

    #[test]
    fn money_display() {
        assert_eq!(Money::from_f64(1.23).unwrap().to_string(), "1.23");
        assert_eq!(Money::from_f64(0.05).unwrap().to_string(), "0.05");
        assert_eq!(Money::from_f64(100.0).unwrap().to_string(), "100.00");
    }

    #[test]
    fn money_serde_roundtrip() {
        let m = Money::from_f64(42.50).unwrap();
        let json = serde_json::to_string(&m).unwrap();
        assert_eq!(json, "\"42.50\"");
        let restored: Money = serde_json::from_str(&json).unwrap();
        assert_eq!(restored, m);
    }
}
