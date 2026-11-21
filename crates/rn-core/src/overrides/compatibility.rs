use serde::{Deserialize, Serialize};

use crate::schemas::OverrideMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedOverride {
    pub rna_path: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverrideValidationResult {
    pub applicable: OverrideMap,
    pub skipped: Vec<SkippedOverride>,
}

/// Normalizes engine name to uppercase canonical identifier.
pub fn normalize_engine(engine: Option<&str>) -> String {
    let eng = match engine {
        Some(e) if !e.trim().is_empty() => e.trim().to_uppercase(),
        _ => return "CYCLES".to_string(),
    };

    if eng.contains("EEVEE") {
        if eng.contains("NEXT") {
            "BLENDER_EEVEE_NEXT".to_string()
        } else {
            "BLENDER_EEVEE".to_string()
        }
    } else if eng.contains("WORKBENCH") {
        "BLENDER_WORKBENCH".to_string()
    } else if eng.contains("CYCLES") {
        "CYCLES".to_string()
    } else {
        eng
    }
}

/// Determines if an RNA dot-path property is supported/relevant for a given engine.
pub fn is_property_relevant_to_engine(rna_path: &str, engine: &str) -> bool {
    let norm_engine = normalize_engine(Some(engine));

    // Cycles specific properties
    if rna_path.starts_with("scene.cycles.") {
        return norm_engine == "CYCLES";
    }

    // EEVEE specific properties
    if rna_path.starts_with("scene.eevee.") {
        return norm_engine == "BLENDER_EEVEE" || norm_engine == "BLENDER_EEVEE_NEXT";
    }

    // Common properties (scene.render.*, scene.render.image_settings.*, scene.render.ffmpeg.*, etc.)
    true
}

/// Returns a filtered copy of the overrides diff containing only properties
/// relevant to the currently active engine.
pub fn filter_overrides_for_active_engine(overrides: &OverrideMap, engine: &str) -> OverrideMap {
    let mut filtered = OverrideMap::new();
    for (path, val) in overrides {
        if is_property_relevant_to_engine(path, engine) {
            filtered.insert(path.clone(), val.clone());
        }
    }
    filtered
}

/// Validates an override diff against a target engine.
/// Skips properties not supported by target engine.
pub fn validate_overrides_for_job(
    overrides: &OverrideMap,
    engine: Option<&str>,
) -> OverrideValidationResult {
    let mut applicable = OverrideMap::new();
    let mut skipped = Vec::new();

    // If diff overrides scene.render.engine, that becomes the target engine
    let effective_engine =
        if let Some(serde_json::Value::String(eng)) = overrides.get("scene.render.engine") {
            eng.as_str()
        } else {
            engine.unwrap_or("CYCLES")
        };

    let norm_engine = normalize_engine(Some(effective_engine));

    for (rna_path, val) in overrides {
        if !is_property_relevant_to_engine(rna_path, &norm_engine) {
            skipped.push(SkippedOverride {
                rna_path: rna_path.clone(),
                reason: format!(
                    "Property \"{}\" is not supported by engine {}",
                    rna_path, effective_engine
                ),
            });
            continue;
        }

        applicable.insert(rna_path.clone(), val.clone());
    }

    OverrideValidationResult {
        applicable,
        skipped,
    }
}
