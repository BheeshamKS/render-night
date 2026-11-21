use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use crate::schemas::Preset;

#[derive(Debug, Clone)]
pub struct PresetStore {
    path: PathBuf,
}

impl PresetStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Loads presets from disk. If file does not exist, returns empty Vec.
    pub fn load_presets(&self) -> io::Result<Vec<Preset>> {
        if !self.path.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&self.path)?;
        if content.trim().is_empty() {
            return Ok(Vec::new());
        }

        // Try parsing list first
        if let Ok(list) = serde_json::from_str::<Vec<Preset>>(&content) {
            return Ok(list);
        }

        // Try single object fallback
        if let Ok(single) = serde_json::from_str::<Preset>(&content) {
            return Ok(vec![single]);
        }

        Ok(Vec::new())
    }

    /// Saves or updates a preset with atomic file persistence.
    pub fn save_preset(&self, preset: Preset) -> io::Result<Preset> {
        let mut list = self.load_presets()?;
        if let Some(pos) = list.iter().position(|p| p.id == preset.id) {
            list[pos] = preset.clone();
        } else {
            list.push(preset.clone());
        }

        self.save_all(&list)?;
        Ok(preset)
    }

    /// Deletes a preset by id.
    pub fn delete_preset(&self, id: &str) -> io::Result<bool> {
        let mut list = self.load_presets()?;
        let initial_len = list.len();
        list.retain(|p| p.id != id);

        if list.len() < initial_len {
            self.save_all(&list)?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Atomically writes the preset list to disk.
    fn save_all(&self, list: &[Preset]) -> io::Result<()> {
        let parent = self.path.parent().unwrap_or_else(|| Path::new("."));
        fs::create_dir_all(parent)?;

        let serialized = serde_json::to_string_pretty(list)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        let temp_path = parent.join(format!(
            ".{}.tmp",
            self.path
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| "presets".to_string())
        ));

        fs::write(&temp_path, serialized.as_bytes())?;
        fs::rename(&temp_path, &self.path)?;
        Ok(())
    }

    /// Imports presets from a JSON string, appending new ones.
    pub fn import_presets(&self, json_str: &str) -> Result<Vec<Preset>, String> {
        let imported_list: Vec<Preset> =
            if let Ok(list) = serde_json::from_str::<Vec<Preset>>(json_str) {
                list
            } else if let Ok(single) = serde_json::from_str::<Preset>(json_str) {
                vec![single]
            } else {
                return Err("Invalid JSON preset format".to_string());
            };

        let mut existing = self.load_presets().map_err(|e| e.to_string())?;
        let mut added = Vec::new();

        for imp in imported_list {
            if let Some(pos) = existing.iter().position(|p| p.id == imp.id) {
                existing[pos] = imp.clone();
            } else {
                existing.push(imp.clone());
            }
            added.push(imp);
        }

        self.save_all(&existing).map_err(|e| e.to_string())?;
        Ok(added)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_preset_store_crud() {
        let dir = tempdir().unwrap();
        let store_path = dir.path().join("presets.json");
        let store = PresetStore::new(&store_path);

        assert!(store.load_presets().unwrap().is_empty());

        let mut overrides = crate::schemas::OverrideMap::new();
        overrides.insert("scene.cycles.samples".to_string(), serde_json::json!(256));

        let p1 = Preset {
            id: "p1".to_string(),
            name: "High Samples".to_string(),
            description: Some("256 samples".to_string()),
            overrides: overrides.clone(),
            device: Some("GPU".to_string()),
            engine: Some("CYCLES".to_string()),
            output_dir: None,
            output_pattern: None,
            created_at: 1000,
            updated_at: 1000,
        };

        let saved = store.save_preset(p1.clone()).unwrap();
        assert_eq!(saved.id, "p1");

        let loaded = store.load_presets().unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].name, "High Samples");

        // Update
        let mut p1_updated = p1;
        p1_updated.name = "Ultra Samples".to_string();
        store.save_preset(p1_updated).unwrap();

        let loaded_updated = store.load_presets().unwrap();
        assert_eq!(loaded_updated.len(), 1);
        assert_eq!(loaded_updated[0].name, "Ultra Samples");

        // Delete
        let deleted = store.delete_preset("p1").unwrap();
        assert!(deleted);
        assert!(store.load_presets().unwrap().is_empty());
    }

    #[test]
    fn test_preset_import() {
        let dir = tempdir().unwrap();
        let store_path = dir.path().join("presets.json");
        let store = PresetStore::new(&store_path);

        let json = r#"[
            {
                "id": "imp1",
                "name": "Imported Preset",
                "overrides": { "scene.render.resolution_x": 1920 },
                "createdAt": 100,
                "updatedAt": 100
            }
        ]"#;

        let imported = store.import_presets(json).unwrap();
        assert_eq!(imported.len(), 1);
        assert_eq!(imported[0].id, "imp1");

        let loaded = store.load_presets().unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].name, "Imported Preset");
    }
}
