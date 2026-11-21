use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BlenderSource {
    System,
    Steam,
    Flatpak,
    Snap,
    Custom,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlenderInstallation {
    pub id: String,
    pub executable: Vec<String>,
    pub display_path: String,
    pub version: String,
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
    pub is_portable: bool,
    pub source: BlenderSource,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum BlenderDiscoveryError {
    #[error("Blender executable not found at: {0}")]
    NotFound(String),
    #[error("Failed to execute {0}: {1}")]
    ExecutionFailed(String, String),
    #[error("Could not parse Blender version from: {0}")]
    ParseVersion(String),
    #[error("Probe timed out after {0} seconds")]
    Timeout(u64),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Linux,
    Windows,
    MacOS,
}

impl Platform {
    pub fn current() -> Self {
        #[cfg(target_os = "windows")]
        {
            Platform::Windows
        }
        #[cfg(target_os = "macos")]
        {
            Platform::MacOS
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            Platform::Linux
        }
    }
}

/// Filesystem abstraction trait for 100% mockable discovery and pre-flight validation.
pub trait BlenderFs: Send + Sync {
    fn exists(&self, path: &Path) -> bool;
    fn is_executable(&self, path: &Path) -> bool;
    fn read_header(&self, path: &Path) -> std::io::Result<[u8; 12]>;
    fn read_dir(&self, path: &Path) -> std::io::Result<Vec<PathBuf>> {
        let entries = std::fs::read_dir(path)?;
        let mut paths = Vec::new();
        for entry in entries {
            paths.push(entry?.path());
        }
        Ok(paths)
    }
}

/// Process execution abstraction trait for mockable version probing.
pub trait BlenderProber: Send + Sync {
    fn probe(&self, argv: &[String]) -> Result<String, BlenderDiscoveryError>;
}

/// Environment variable abstraction trait for mockable cross-platform testing.
pub trait EnvLookup: Send + Sync {
    fn var(&self, key: &str) -> Option<String>;
}

// Real implementations
#[derive(Debug, Default, Clone, Copy)]
pub struct RealBlenderFs;

impl BlenderFs for RealBlenderFs {
    fn exists(&self, path: &Path) -> bool {
        path.exists()
    }

    fn is_executable(&self, path: &Path) -> bool {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(meta) = path.metadata() {
                return meta.is_file() && (meta.permissions().mode() & 0o111 != 0);
            }
            false
        }
        #[cfg(not(unix))]
        {
            path.is_file()
        }
    }

    fn read_header(&self, path: &Path) -> std::io::Result<[u8; 12]> {
        use std::io::Read;
        let mut file = std::fs::File::open(path)?;
        let mut buf = [0u8; 12];
        file.read_exact(&mut buf)?;
        Ok(buf)
    }

    fn read_dir(&self, path: &Path) -> std::io::Result<Vec<PathBuf>> {
        let entries = std::fs::read_dir(path)?;
        let mut paths = Vec::new();
        for e in entries.flatten() {
            paths.push(e.path());
        }
        Ok(paths)
    }
}

pub struct RealEnv;
impl EnvLookup for RealEnv {
    fn var(&self, key: &str) -> Option<String> {
        std::env::var(key).ok()
    }
}

pub struct RealBlenderProber {
    pub timeout_seconds: u64,
}

impl Default for RealBlenderProber {
    fn default() -> Self {
        Self {
            timeout_seconds: 15,
        }
    }
}

impl BlenderProber for RealBlenderProber {
    fn probe(&self, argv: &[String]) -> Result<String, BlenderDiscoveryError> {
        if argv.is_empty() {
            return Err(BlenderDiscoveryError::NotFound("Empty command".into()));
        }

        let cmd = &argv[0];
        let mut command = std::process::Command::new(cmd);
        if argv.len() > 1 {
            command.args(&argv[1..]);
        }
        command.arg("--version");

        let output = command
            .output()
            .map_err(|e| BlenderDiscoveryError::ExecutionFailed(argv.join(" "), e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(BlenderDiscoveryError::ExecutionFailed(
                argv.join(" "),
                format!("status {}: {}", output.status, stderr.trim()),
            ));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}

// In-Memory Mocks for unit testing
#[derive(Debug, Default, Clone)]
pub struct MockBlenderFs {
    pub existing_paths: HashSet<PathBuf>,
    pub executable_paths: HashSet<PathBuf>,
    pub file_headers: HashMap<PathBuf, [u8; 12]>,
    pub dir_entries: HashMap<PathBuf, Vec<PathBuf>>,
}

impl BlenderFs for MockBlenderFs {
    fn exists(&self, path: &Path) -> bool {
        self.existing_paths.contains(path)
            || self.file_headers.contains_key(path)
            || self.dir_entries.contains_key(path)
    }

    fn is_executable(&self, path: &Path) -> bool {
        self.executable_paths.contains(path)
    }

    fn read_header(&self, path: &Path) -> std::io::Result<[u8; 12]> {
        if let Some(h) = self.file_headers.get(path) {
            Ok(*h)
        } else {
            Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "not found",
            ))
        }
    }

    fn read_dir(&self, path: &Path) -> std::io::Result<Vec<PathBuf>> {
        Ok(self.dir_entries.get(path).cloned().unwrap_or_default())
    }
}

#[derive(Debug, Default, Clone)]
pub struct MockBlenderProber {
    pub canned: HashMap<String, Result<String, String>>,
}

impl BlenderProber for MockBlenderProber {
    fn probe(&self, argv: &[String]) -> Result<String, BlenderDiscoveryError> {
        let key = argv.join(" ");
        if let Some(res) = self.canned.get(&key) {
            match res {
                Ok(stdout) => Ok(stdout.clone()),
                Err(err) => Err(BlenderDiscoveryError::ExecutionFailed(key, err.clone())),
            }
        } else {
            Err(BlenderDiscoveryError::NotFound(key))
        }
    }
}

#[derive(Debug, Default, Clone)]
pub struct MockEnv {
    pub vars: HashMap<String, String>,
}

impl EnvLookup for MockEnv {
    fn var(&self, key: &str) -> Option<String> {
        self.vars.get(key).cloned()
    }
}

/// Parses standard output from `blender --version`.
pub fn parse_blender_version_output(
    stdout: &str,
) -> Result<(String, u32, u32, u32), BlenderDiscoveryError> {
    let lower = stdout.to_ascii_lowercase();
    let idx = lower.find("blender").ok_or_else(|| {
        let sample: String = stdout.chars().take(200).collect();
        BlenderDiscoveryError::ParseVersion(sample)
    })?;

    let rest = stdout[idx + 7..].trim_start();
    let mut chars = rest.chars().peekable();
    let mut major_str = String::new();
    while let Some(&c) = chars.peek() {
        if c.is_ascii_digit() {
            major_str.push(c);
            chars.next();
        } else {
            break;
        }
    }

    if major_str.is_empty() || chars.next() != Some('.') {
        let sample: String = stdout.chars().take(200).collect();
        return Err(BlenderDiscoveryError::ParseVersion(sample));
    }

    let mut minor_str = String::new();
    while let Some(&c) = chars.peek() {
        if c.is_ascii_digit() {
            minor_str.push(c);
            chars.next();
        } else {
            break;
        }
    }

    if minor_str.is_empty() {
        let sample: String = stdout.chars().take(200).collect();
        return Err(BlenderDiscoveryError::ParseVersion(sample));
    }

    let mut patch_str = String::new();
    if chars.peek() == Some(&'.') {
        chars.next();
        while let Some(&c) = chars.peek() {
            if c.is_ascii_digit() {
                patch_str.push(c);
                chars.next();
            } else {
                break;
            }
        }
    }

    let major: u32 = major_str
        .parse()
        .map_err(|_| BlenderDiscoveryError::ParseVersion(stdout.chars().take(200).collect()))?;
    let minor: u32 = minor_str
        .parse()
        .map_err(|_| BlenderDiscoveryError::ParseVersion(stdout.chars().take(200).collect()))?;
    let patch: u32 = if patch_str.is_empty() {
        0
    } else {
        patch_str.parse().unwrap_or(0)
    };

    let version = format!("{major}.{minor}.{patch}");
    Ok((version, major, minor, patch))
}

/// Sorts installations in descending semver order (highest version first).
pub fn sort_blenders_desc(installs: &mut [BlenderInstallation]) {
    installs.sort_by(|a, b| {
        b.major
            .cmp(&a.major)
            .then_with(|| b.minor.cmp(&a.minor))
            .then_with(|| b.patch.cmp(&a.patch))
    });
}

/// Check whether a discovered Blender installation is compatible with Render Night.
/// Requirement: 3.6 LTS, 4.x, 5.x.
pub fn is_compatible_blender(install: &BlenderInstallation) -> bool {
    match install.major {
        3 => install.minor >= 6,
        4 | 5 => true,
        _ => false,
    }
}

pub fn is_portable(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.contains("portable") || lower.contains("portable-blender")
}

pub fn determine_source(candidate: &[String], custom_paths: &[Vec<String>]) -> BlenderSource {
    let key = candidate.join(" ");
    if custom_paths.iter().any(|cp| cp.join(" ") == key) {
        return BlenderSource::Custom;
    }
    if let Some(cmd) = candidate.first() {
        if cmd == "flatpak" {
            return BlenderSource::Flatpak;
        }
        if cmd.contains("snap") {
            return BlenderSource::Snap;
        }
        if cmd.to_ascii_lowercase().contains("steam") {
            return BlenderSource::Steam;
        }
    }
    BlenderSource::System
}

/// Generate candidate executables for a given platform.
pub fn candidate_executables_for_platform(
    platform: Platform,
    fs: &dyn BlenderFs,
    env: &dyn EnvLookup,
) -> Vec<Vec<String>> {
    let mut candidates: Vec<Vec<String>> = Vec::new();
    let home = env
        .var("HOME")
        .or_else(|| env.var("USERPROFILE"))
        .unwrap_or_default();

    match platform {
        Platform::Windows => {
            let mut pf_roots: Vec<String> = Vec::new();
            if let Some(pf) = env.var("ProgramFiles") {
                if !pf.is_empty() {
                    pf_roots.push(pf);
                }
            }
            if let Some(pfx86) = env.var("ProgramFiles(x86)") {
                if !pfx86.is_empty() {
                    pf_roots.push(pfx86);
                }
            }
            if pf_roots.is_empty() {
                pf_roots.push("C:\\Program Files".into());
                pf_roots.push("C:\\Program Files (x86)".into());
            }

            let mut seen_roots = HashSet::new();
            for root in pf_roots {
                if !seen_roots.insert(root.clone()) {
                    continue;
                }
                let root_path = Path::new(&root);
                candidates.push(vec![root_path
                    .join("Blender Foundation")
                    .join("Blender")
                    .join("blender.exe")
                    .to_string_lossy()
                    .into()]);

                let bf_dir = root_path.join("Blender Foundation");
                if fs.exists(&bf_dir) {
                    if let Ok(entries) = fs.read_dir(&bf_dir) {
                        for entry in entries {
                            candidates
                                .push(vec![entry.join("blender.exe").to_string_lossy().into()]);
                        }
                    }
                }

                candidates.push(vec![root_path
                    .join("Steam")
                    .join("steamapps")
                    .join("common")
                    .join("Blender")
                    .join("blender.exe")
                    .to_string_lossy()
                    .into()]);
            }

            if let Some(local_app_data) = env.var("LOCALAPPDATA") {
                if !local_app_data.is_empty() {
                    candidates.push(vec![Path::new(&local_app_data)
                        .join("Microsoft")
                        .join("WindowsApps")
                        .join("blender.exe")
                        .to_string_lossy()
                        .into()]);
                }
            }

            candidates.push(vec!["blender.exe".into()]);
        }
        Platform::MacOS => {
            candidates.push(vec![
                "/Applications/Blender.app/Contents/MacOS/Blender".into()
            ]);
            if !home.is_empty() {
                let home_path = Path::new(&home);
                candidates.push(vec![home_path
                    .join("Applications")
                    .join("Blender.app")
                    .join("Contents")
                    .join("MacOS")
                    .join("Blender")
                    .to_string_lossy()
                    .into()]);
                candidates.push(vec![home_path
                    .join("Library")
                    .join("Application Support")
                    .join("Steam")
                    .join("steamapps")
                    .join("common")
                    .join("Blender")
                    .join("Blender.app")
                    .join("Contents")
                    .join("MacOS")
                    .join("Blender")
                    .to_string_lossy()
                    .into()]);
            }

            let apps_dir = Path::new("/Applications");
            if fs.exists(apps_dir) {
                if let Ok(entries) = fs.read_dir(apps_dir) {
                    for entry in entries {
                        if let Some(file_name) = entry.file_name().and_then(|n| n.to_str()) {
                            if file_name.starts_with("Blender")
                                && file_name.ends_with(".app")
                                && file_name != "Blender.app"
                            {
                                candidates.push(vec![entry
                                    .join("Contents")
                                    .join("MacOS")
                                    .join("Blender")
                                    .to_string_lossy()
                                    .into()]);
                            }
                        }
                    }
                }
            }

            candidates.push(vec!["blender".into()]);
        }
        Platform::Linux => {
            candidates.push(vec![
                "flatpak".into(),
                "run".into(),
                "org.blender.Blender".into(),
            ]);
            candidates.push(vec!["/usr/bin/blender".into()]);
            candidates.push(vec!["/usr/local/bin/blender".into()]);
            candidates.push(vec!["/snap/bin/blender".into()]);
            candidates.push(vec!["/var/lib/snapd/snap/bin/blender".into()]);

            let opt_dir = Path::new("/opt");
            if fs.exists(opt_dir) {
                if let Ok(entries) = fs.read_dir(opt_dir) {
                    for entry in entries {
                        if let Some(file_name) = entry.file_name().and_then(|n| n.to_str()) {
                            if file_name.starts_with("blender") {
                                candidates
                                    .push(vec![entry.join("blender").to_string_lossy().into()]);
                            }
                        }
                    }
                }
            }

            if !home.is_empty() {
                let home_path = Path::new(&home);
                candidates.push(vec![home_path
                    .join("blender")
                    .join("blender")
                    .to_string_lossy()
                    .into()]);
                candidates.push(vec![home_path
                    .join(".local")
                    .join("bin")
                    .join("blender")
                    .to_string_lossy()
                    .into()]);

                candidates.push(vec![home_path
                    .join(".steam")
                    .join("steam")
                    .join("steamapps")
                    .join("common")
                    .join("Blender")
                    .join("blender")
                    .to_string_lossy()
                    .into()]);
                candidates.push(vec![home_path
                    .join(".local")
                    .join("share")
                    .join("Steam")
                    .join("steamapps")
                    .join("common")
                    .join("Blender")
                    .join("blender")
                    .to_string_lossy()
                    .into()]);

                if let Ok(entries) = fs.read_dir(home_path) {
                    for entry in entries {
                        if let Some(file_name) = entry.file_name().and_then(|n| n.to_str()) {
                            if file_name.starts_with("blender-")
                                || file_name.starts_with("blender_")
                            {
                                candidates
                                    .push(vec![entry.join("blender").to_string_lossy().into()]);
                            }
                        }
                    }
                }
            }

            candidates.push(vec!["blender".into()]);
        }
    }

    candidates
}

pub fn candidate_executables() -> Vec<Vec<String>> {
    candidate_executables_for_platform(Platform::current(), &RealBlenderFs, &RealEnv)
}

/// Probes a single candidate executable command array.
pub fn probe_blender(
    candidate: &[String],
    source: BlenderSource,
    fs: &dyn BlenderFs,
    prober: &dyn BlenderProber,
) -> Result<BlenderInstallation, BlenderDiscoveryError> {
    if candidate.is_empty() {
        return Err(BlenderDiscoveryError::NotFound("Empty candidate".into()));
    }

    let cache_key = candidate.join(" ");
    let cmd = &candidate[0];

    if (cmd.starts_with('/') || cmd.contains('\\')) && !fs.exists(Path::new(cmd)) {
        return Err(BlenderDiscoveryError::NotFound(cmd.clone()));
    }

    let stdout = prober.probe(candidate)?;
    let (version, major, minor, patch) = parse_blender_version_output(&stdout)?;

    Ok(BlenderInstallation {
        id: cache_key.clone(),
        executable: candidate.to_vec(),
        display_path: cache_key.clone(),
        version,
        major,
        minor,
        patch,
        is_portable: is_portable(&cache_key),
        source,
    })
}

/// Discovers all Blender installations using custom paths and platform defaults.
pub fn discover_all_blenders_with(
    custom_paths: &[Vec<String>],
    fs: &dyn BlenderFs,
    prober: &dyn BlenderProber,
    env: &dyn EnvLookup,
    platform: Platform,
) -> Vec<BlenderInstallation> {
    let platform_candidates = candidate_executables_for_platform(platform, fs, env);
    let mut all_candidates = Vec::new();
    all_candidates.extend_from_slice(custom_paths);
    all_candidates.extend(platform_candidates);

    let mut seen_ids = HashSet::new();
    let mut results = Vec::new();

    for candidate in all_candidates {
        let key = candidate.join(" ");
        if seen_ids.contains(&key) {
            continue;
        }

        let source = determine_source(&candidate, custom_paths);
        if let Ok(installation) = probe_blender(&candidate, source, fs, prober) {
            if seen_ids.insert(installation.id.clone()) {
                seen_ids.insert(installation.display_path.clone());
                results.push(installation);
            }
        }
    }

    sort_blenders_desc(&mut results);
    results
}

pub fn discover_all_blenders(custom_paths: &[Vec<String>]) -> Vec<BlenderInstallation> {
    discover_all_blenders_with(
        custom_paths,
        &RealBlenderFs,
        &RealBlenderProber::default(),
        &RealEnv,
        Platform::current(),
    )
}

pub fn validate_custom_blender(
    custom_command: &[String],
    fs: &dyn BlenderFs,
    prober: &dyn BlenderProber,
) -> Result<BlenderInstallation, BlenderDiscoveryError> {
    probe_blender(custom_command, BlenderSource::Custom, fs, prober)
}

pub fn resolve_blender_for_cli(
    spec: Option<&str>,
    custom_paths: &[Vec<String>],
    fs: &dyn BlenderFs,
    prober: &dyn BlenderProber,
    env: &dyn EnvLookup,
    platform: Platform,
) -> Result<BlenderInstallation, String> {
    let all_blenders = discover_all_blenders_with(custom_paths, fs, prober, env, platform);

    match spec {
        None | Some("latest") | Some("LATEST") => {
            all_blenders.into_iter().next().ok_or_else(|| {
                "No Blender installations found on system. Please specify a Blender path with --blender <path>.".to_string()
            })
        }
        Some(s) => {
            let path = Path::new(s);
            if fs.exists(path) {
                return validate_custom_blender(&[s.to_string()], fs, prober)
                    .map_err(|e| format!("Invalid Blender binary at {s}: {e}"));
            }

            if let Some(matched) = all_blenders.iter().find(|b| b.version.starts_with(s)) {
                return Ok(matched.clone());
            }

            let available = all_blenders
                .iter()
                .map(|b| format!("{} ({})", b.version, b.display_path))
                .collect::<Vec<_>>()
                .join(", ");

            Err(format!(
                "Blender \"{s}\" not found. Available versions on system: {}.",
                if available.is_empty() {
                    "none"
                } else {
                    &available
                }
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_blender_version_output() {
        let (v, maj, min, pat) =
            parse_blender_version_output("Blender 4.2.0 LTS (sub 0)\nbuild date: 2024-07-16")
                .unwrap();
        assert_eq!(v, "4.2.0");
        assert_eq!(maj, 4);
        assert_eq!(min, 2);
        assert_eq!(pat, 0);

        let (v, maj, min, pat) = parse_blender_version_output("Blender 3.6.12 (sub 0)\n").unwrap();
        assert_eq!(v, "3.6.12");
        assert_eq!(maj, 3);
        assert_eq!(min, 6);
        assert_eq!(pat, 12);

        let (v, maj, min, pat) = parse_blender_version_output("Blender 5.0 (sub 0)\n").unwrap();
        assert_eq!(v, "5.0.0");
        assert_eq!(maj, 5);
        assert_eq!(min, 0);
        assert_eq!(pat, 0);

        let (v, maj, min, pat) = parse_blender_version_output("Blender 5.0.0 Alpha\n").unwrap();
        assert_eq!(v, "5.0.0");
        assert_eq!(maj, 5);
        assert_eq!(min, 0);
        assert_eq!(pat, 0);

        assert!(parse_blender_version_output("Segmentation fault").is_err());
    }

    #[test]
    fn test_sort_blenders_desc() {
        let make_install = |v: &str, maj, min, pat| BlenderInstallation {
            id: v.into(),
            executable: vec![v.into()],
            display_path: v.into(),
            version: v.into(),
            major: maj,
            minor: min,
            patch: pat,
            is_portable: false,
            source: BlenderSource::System,
        };

        let mut list = vec![
            make_install("3.6.12", 3, 6, 12),
            make_install("5.0.0", 5, 0, 0),
            make_install("4.2.1", 4, 2, 1),
        ];

        sort_blenders_desc(&mut list);
        assert_eq!(list[0].version, "5.0.0");
        assert_eq!(list[1].version, "4.2.1");
        assert_eq!(list[2].version, "3.6.12");
    }

    #[test]
    fn test_is_compatible_blender() {
        let make_install = |maj, min| BlenderInstallation {
            id: String::new(),
            executable: vec![],
            display_path: String::new(),
            version: String::new(),
            major: maj,
            minor: min,
            patch: 0,
            is_portable: false,
            source: BlenderSource::System,
        };

        assert!(!is_compatible_blender(&make_install(2, 80)));
        assert!(!is_compatible_blender(&make_install(3, 5)));
        assert!(is_compatible_blender(&make_install(3, 6)));
        assert!(is_compatible_blender(&make_install(4, 0)));
        assert!(is_compatible_blender(&make_install(4, 2)));
        assert!(is_compatible_blender(&make_install(5, 0)));
        assert!(!is_compatible_blender(&make_install(6, 0)));
    }

    #[test]
    fn test_candidate_paths_linux() {
        let mock_fs = MockBlenderFs::default();
        let mock_env = MockEnv::default();
        let candidates = candidate_executables_for_platform(Platform::Linux, &mock_fs, &mock_env);

        assert!(candidates.iter().any(|c| c
            == &vec![
                "flatpak".to_string(),
                "run".to_string(),
                "org.blender.Blender".to_string()
            ]));
        assert!(candidates
            .iter()
            .any(|c| c == &vec!["/usr/bin/blender".to_string()]));
        assert!(candidates.iter().any(|c| c == &vec!["blender".to_string()]));
    }

    #[test]
    fn test_candidate_paths_windows() {
        let mock_fs = MockBlenderFs::default();
        let mut mock_env = MockEnv::default();
        mock_env
            .vars
            .insert("ProgramFiles".into(), "C:\\Program Files".into());
        let candidates = candidate_executables_for_platform(Platform::Windows, &mock_fs, &mock_env);

        assert!(candidates
            .iter()
            .any(|c| c[0].contains("Blender Foundation")));
        assert!(candidates
            .iter()
            .any(|c| c == &vec!["blender.exe".to_string()]));
    }

    #[test]
    fn test_candidate_paths_macos() {
        let mock_fs = MockBlenderFs::default();
        let mock_env = MockEnv::default();
        let candidates = candidate_executables_for_platform(Platform::MacOS, &mock_fs, &mock_env);

        assert!(candidates
            .iter()
            .any(|c| c[0] == "/Applications/Blender.app/Contents/MacOS/Blender"));
        assert!(candidates.iter().any(|c| c == &vec!["blender".to_string()]));
    }

    #[test]
    fn test_mock_discovery_and_cli_resolver() {
        let mut mock_fs = MockBlenderFs::default();
        mock_fs
            .existing_paths
            .insert(PathBuf::from("/usr/bin/blender"));
        mock_fs
            .existing_paths
            .insert(PathBuf::from("/opt/blender-5.0/blender"));

        let mut mock_prober = MockBlenderProber::default();
        mock_prober.canned.insert(
            "/usr/bin/blender".into(),
            Ok("Blender 4.2.0 (sub 0)\n".into()),
        );
        mock_prober.canned.insert(
            "/opt/blender-5.0/blender".into(),
            Ok("Blender 5.0.0 Alpha\n".into()),
        );

        let mock_env = MockEnv::default();
        let custom = vec![vec!["/opt/blender-5.0/blender".into()]];

        let discovered =
            discover_all_blenders_with(&custom, &mock_fs, &mock_prober, &mock_env, Platform::Linux);

        assert_eq!(discovered.len(), 2);
        assert_eq!(discovered[0].version, "5.0.0");
        assert_eq!(discovered[1].version, "4.2.0");

        // CLI resolver "latest"
        let latest = resolve_blender_for_cli(
            Some("latest"),
            &custom,
            &mock_fs,
            &mock_prober,
            &mock_env,
            Platform::Linux,
        )
        .unwrap();
        assert_eq!(latest.version, "5.0.0");

        // CLI resolver version prefix "4.2"
        let matched = resolve_blender_for_cli(
            Some("4.2"),
            &custom,
            &mock_fs,
            &mock_prober,
            &mock_env,
            Platform::Linux,
        )
        .unwrap();
        assert_eq!(matched.version, "4.2.0");

        // CLI resolver not found
        let err = resolve_blender_for_cli(
            Some("2.93"),
            &custom,
            &mock_fs,
            &mock_prober,
            &mock_env,
            Platform::Linux,
        )
        .unwrap_err();
        assert!(err.contains("not found"));
    }
}
