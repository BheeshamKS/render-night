use crate::fixtures::{create_default_inspect_output, create_missing_assets_inspect_output};
use crate::scenarios::MockScenario;
use std::fs;
use std::path::Path;

pub fn execute_inspect(
    blend_file: Option<&Path>,
    output_path: &Path,
    scenario: MockScenario,
) -> Result<(), i32> {
    let blend_str = blend_file
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "test.blend".to_string());

    // Scenario 5: Inspect Failure
    if scenario == MockScenario::InspectFailure
        || blend_str.contains("corrupt")
        || blend_str.contains("fail")
    {
        eprintln!("Fra:1\nError: Blender cannot read corrupted blend file!");
        return Err(1);
    }

    let inspect_data = if scenario == MockScenario::MissingAssets {
        create_missing_assets_inspect_output(&blend_str)
    } else {
        create_default_inspect_output(&blend_str)
    };

    if let Some(parent) = output_path.parent() {
        if !parent.as_os_str().is_empty() {
            let _ = fs::create_dir_all(parent);
        }
    }

    let serialized = match serde_json::to_string_pretty(&inspect_data) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Error serializing inspect JSON: {e}");
            return Err(1);
        }
    };

    if let Err(e) = fs::write(output_path, serialized) {
        eprintln!(
            "Error writing inspect output to '{}': {e}",
            output_path.display()
        );
        return Err(1);
    }

    println!("RN_INSPECT_SUCCESS: {}", output_path.display());
    println!("Blender quit");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn test_inspect_normal() {
        let temp_out = NamedTempFile::new().unwrap();
        let res = execute_inspect(
            Some(Path::new("my_scene.blend")),
            temp_out.path(),
            MockScenario::Normal,
        );
        assert!(res.is_ok());

        let content = fs::read_to_string(temp_out.path()).unwrap();
        let json_val: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(json_val["blendPath"], "my_scene.blend");
        assert_eq!(json_val["missingFiles"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn test_inspect_missing_assets() {
        let temp_out = NamedTempFile::new().unwrap();
        let res = execute_inspect(
            Some(Path::new("missing_demo.blend")),
            temp_out.path(),
            MockScenario::MissingAssets,
        );
        assert!(res.is_ok());

        let content = fs::read_to_string(temp_out.path()).unwrap();
        let json_val: serde_json::Value = serde_json::from_str(&content).unwrap();
        let missing = json_val["missingFiles"].as_array().unwrap();
        assert!(!missing.is_empty());
        assert!(missing.iter().any(|item| item["relevance"] == "used"));
        assert!(missing.iter().any(|item| item["relevance"] == "unused"));
    }

    #[test]
    fn test_inspect_failure_scenario() {
        let temp_out = NamedTempFile::new().unwrap();
        let res = execute_inspect(
            Some(Path::new("valid.blend")),
            temp_out.path(),
            MockScenario::InspectFailure,
        );
        assert_eq!(res, Err(1));
    }

    #[test]
    fn test_inspect_corrupt_filename_trigger() {
        let temp_out = NamedTempFile::new().unwrap();
        let res = execute_inspect(
            Some(Path::new("corrupt_project.blend")),
            temp_out.path(),
            MockScenario::Normal,
        );
        assert_eq!(res, Err(1));
    }
}
