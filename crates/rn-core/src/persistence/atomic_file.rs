// Render Night - Atomic File Persistence
// SPDX-License-Identifier: GPL-3.0-or-later

use serde::de::DeserializeOwned;
use serde::Serialize;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;

/// Write data atomically by writing to a temporary file in the same directory,
/// calling sync_all(), and renaming atomically over the destination path.
pub fn write_atomic<P: AsRef<Path>>(path: P, content: &[u8]) -> std::io::Result<()> {
    let target = path.as_ref();
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }

    let parent = target.parent().unwrap_or_else(|| Path::new("."));
    let temp_name = format!(
        ".tmp.{}.{}.{}",
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0),
        target
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or("file")
    );
    let temp_path = parent.join(temp_name);

    let mut file = File::create(&temp_path)?;
    file.write_all(content)?;
    file.sync_all()?;
    drop(file);

    fs::rename(&temp_path, target)?;
    Ok(())
}

/// Serializes data to JSON and atomically writes it to disk.
pub fn write_atomic_json<P: AsRef<Path>, T: Serialize>(path: P, data: &T) -> std::io::Result<()> {
    let json_bytes = serde_json::to_vec_pretty(data)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    write_atomic(path, &json_bytes)
}

/// Reads and parses a JSON file from disk.
pub fn read_json_file<P: AsRef<Path>, T: DeserializeOwned>(path: P) -> std::io::Result<T> {
    let mut file = File::open(path)?;
    let mut content = String::new();
    file.read_to_string(&mut content)?;
    serde_json::from_str(&content)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_atomic_file_write_and_read() {
        let temp = tempdir().unwrap();
        let file_path = temp.path().join("atomic_test.txt");

        write_atomic(&file_path, b"Hello Atomic World!").unwrap();
        let read_back = fs::read_to_string(&file_path).unwrap();
        assert_eq!(read_back, "Hello Atomic World!");
    }

    #[test]
    fn test_atomic_json_write_and_read() {
        let temp = tempdir().unwrap();
        let file_path = temp.path().join("atomic_test.json");

        #[derive(Serialize, serde::Deserialize, PartialEq, Debug)]
        struct TestData {
            name: String,
            count: u32,
        }

        let original = TestData {
            name: "test".to_string(),
            count: 42,
        };

        write_atomic_json(&file_path, &original).unwrap();
        let loaded: TestData = read_json_file(&file_path).unwrap();
        assert_eq!(original, loaded);
    }
}
