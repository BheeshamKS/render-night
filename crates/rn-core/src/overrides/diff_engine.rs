use std::collections::HashMap;

use crate::schemas::OverrideMap;

/// Checks whether a property value differs from its inspected default.
pub fn is_property_modified(
    _rna_path: &str,
    current_value: &serde_json::Value,
    default_value: &serde_json::Value,
) -> bool {
    if current_value == default_value {
        return false;
    }

    match (current_value, default_value) {
        (serde_json::Value::Null, serde_json::Value::Null) => false,
        (serde_json::Value::Array(a), serde_json::Value::Array(b)) => {
            if a.len() != b.len() {
                return true;
            }
            for (elem_a, elem_b) in a.iter().zip(b.iter()) {
                if is_property_modified("", elem_a, elem_b) {
                    return true;
                }
            }
            false
        }
        (serde_json::Value::Object(a), serde_json::Value::Object(b)) => {
            let all_keys: std::collections::HashSet<_> = a.keys().chain(b.keys()).collect();
            for k in all_keys {
                let val_a = a.get(k).unwrap_or(&serde_json::Value::Null);
                let val_b = b.get(k).unwrap_or(&serde_json::Value::Null);
                if is_property_modified(k, val_a, val_b) {
                    return true;
                }
            }
            false
        }
        _ => current_value != default_value,
    }
}

/// Computes the override diff { [rnaPath]: value } containing ONLY values
/// that differ from the file defaults.
pub fn compute_override_diff(
    current_values: &HashMap<String, serde_json::Value>,
    file_defaults: &HashMap<String, serde_json::Value>,
) -> OverrideMap {
    let mut diff = OverrideMap::new();

    for (key, val) in current_values {
        let default_val = file_defaults.get(key).unwrap_or(&serde_json::Value::Null);
        if is_property_modified(key, val, default_val) {
            diff.insert(key.clone(), val.clone());
        }
    }

    diff
}
