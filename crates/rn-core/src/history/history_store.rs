// Render Night - Append-Only JSONL History Store with Rotation
// SPDX-License-Identifier: GPL-3.0-or-later

use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use tracing::info;

use crate::schemas::history::HistoryEntry;

pub const MAX_HISTORY_LINES: usize = 1000;

pub struct HistoryStore {
    history_file_path: PathBuf,
}

impl HistoryStore {
    pub fn new(app_data_dir: &Path) -> Self {
        Self {
            history_file_path: app_data_dir.join("history.jsonl"),
        }
    }

    pub fn file_path(&self) -> &Path {
        &self.history_file_path
    }

    /// Appends a new history entry to the append-only JSONL log.
    /// If lines exceed MAX_HISTORY_LINES, performs automatic rotation.
    pub fn append_entry(&self, entry: &HistoryEntry) -> std::io::Result<()> {
        if let Some(parent) = self.history_file_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let json_line = serde_json::to_string(entry)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.history_file_path)?;

        writeln!(file, "{}", json_line)?;
        file.sync_data()?;
        drop(file);

        self.maybe_rotate()?;
        Ok(())
    }

    /// Reads all history entries from the JSONL log, returning most recent entries first.
    pub fn get_entries(&self) -> std::io::Result<Vec<HistoryEntry>> {
        if !self.history_file_path.exists() {
            return Ok(Vec::new());
        }

        let file = File::open(&self.history_file_path)?;
        let reader = BufReader::new(file);
        let mut entries = Vec::new();

        for line_res in reader.lines() {
            let line = line_res?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if let Ok(entry) = serde_json::from_str::<HistoryEntry>(trimmed) {
                entries.push(entry);
            }
        }

        // Return most recent first
        entries.reverse();
        Ok(entries)
    }

    /// Clears the history log.
    pub fn clear(&self) -> std::io::Result<()> {
        if self.history_file_path.exists() {
            fs::remove_file(&self.history_file_path)?;
        }
        Ok(())
    }

    fn maybe_rotate(&self) -> std::io::Result<()> {
        if !self.history_file_path.exists() {
            return Ok(());
        }

        let file = File::open(&self.history_file_path)?;
        let reader = BufReader::new(file);
        let lines: Vec<String> = reader.lines().map_while(Result::ok).collect();

        if lines.len() > MAX_HISTORY_LINES {
            info!(
                "Rotating history log (lines {} > {})",
                lines.len(),
                MAX_HISTORY_LINES
            );
            let backup_path = self.history_file_path.with_extension("1.jsonl");
            let _ = fs::copy(&self.history_file_path, backup_path);

            // Retain the latest 1,000 entries
            let keep_lines = &lines[lines.len() - MAX_HISTORY_LINES..];
            let mut new_file = File::create(&self.history_file_path)?;
            for l in keep_lines {
                writeln!(new_file, "{}", l)?;
            }
            new_file.sync_all()?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schemas::history::HistoryResult;
    use tempfile::tempdir;

    fn make_test_entry(id: &str) -> HistoryEntry {
        HistoryEntry {
            id: id.to_string(),
            job_id: format!("job-{}", id),
            file_path: "/path/test.blend".to_string(),
            file_name: "test.blend".to_string(),
            project: Some("project".to_string()),
            scene: "Scene".to_string(),
            camera: "Camera".to_string(),
            frame_count: 10,
            total_time_seconds: 5.0,
            average_frame_time_seconds: 0.5,
            engine: "CYCLES".to_string(),
            device: "GPU".to_string(),
            result: HistoryResult::Completed,
            failed_frames: vec![],
            output_path: "/out".to_string(),
            timestamp: 1000,
        }
    }

    #[test]
    fn test_history_store_append_and_get() {
        let temp = tempdir().unwrap();
        let store = HistoryStore::new(temp.path());

        assert!(store.get_entries().unwrap().is_empty());

        store.append_entry(&make_test_entry("1")).unwrap();
        store.append_entry(&make_test_entry("2")).unwrap();

        let entries = store.get_entries().unwrap();
        assert_eq!(entries.len(), 2);
        // Most recent first
        assert_eq!(entries[0].id, "2");
        assert_eq!(entries[1].id, "1");

        store.clear().unwrap();
        assert!(store.get_entries().unwrap().is_empty());
    }
}
