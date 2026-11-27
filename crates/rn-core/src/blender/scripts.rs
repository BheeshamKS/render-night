// Render Night - Embedded Script Assets & Resolver
// SPDX-License-Identifier: GPL-3.0-or-later

use std::path::{Path, PathBuf};

pub const INSPECT_BLEND_PY: &[u8] = include_bytes!("../../../../resources/python/inspect_blend.py");
pub const RENDER_RUNNER_PY: &[u8] = include_bytes!("../../../../resources/python/render_runner.py");

/// Returns target scripts directory in user's local share
pub fn get_scripts_dir() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home)
            .join(".local/share/render-night")
            .join(env!("CARGO_PKG_VERSION"))
            .join("scripts")
    } else if let Some(base_dirs) = directories::BaseDirs::new() {
        base_dirs
            .data_local_dir()
            .join("render-night")
            .join(env!("CARGO_PKG_VERSION"))
            .join("scripts")
    } else {
        std::env::temp_dir()
            .join("render-night")
            .join(env!("CARGO_PKG_VERSION"))
            .join("scripts")
    }
}

/// Extracts embedded python scripts to ~/.local/share/render-night/<version>/scripts/ with 0755 permissions.
/// Automatically updates files if contents have changed.
pub fn ensure_extracted_scripts() -> std::io::Result<PathBuf> {
    let scripts_dir = get_scripts_dir();
    std::fs::create_dir_all(&scripts_dir)?;

    let inspect_path = scripts_dir.join("inspect_blend.py");
    write_if_changed(&inspect_path, INSPECT_BLEND_PY)?;

    let runner_path = scripts_dir.join("render_runner.py");
    write_if_changed(&runner_path, RENDER_RUNNER_PY)?;

    Ok(scripts_dir)
}

fn write_if_changed(target: &Path, content: &[u8]) -> std::io::Result<()> {
    if target.exists() {
        if let Ok(existing) = std::fs::read(target) {
            if existing == content {
                return Ok(());
            }
        }
    }

    std::fs::write(target, content)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = std::fs::metadata(target) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o755);
            let _ = std::fs::set_permissions(target, perms);
        }
    }

    Ok(())
}

/// Resolves path to inspect_blend.py following fallback order:
/// 1. Extracted bundled script in ~/.local/share/render-night/<version>/scripts/
/// 2. Caller-specified resources_path
/// 3. Paths relative to current executable
/// 4. Paths in $APPDIR (AppImage runtime)
/// 5. System install directories (/usr/share/render-night)
/// 6. Manifest / source directory fallbacks
pub fn resolve_inspect_script_path(resources_path: Option<&Path>) -> PathBuf {
    if let Some(res) = resources_path {
        let p = res.join("python").join("inspect_blend.py");
        if p.exists() {
            return p;
        }
        let p2 = res.join("scripts").join("inspect_blend.py");
        if p2.exists() {
            return p2;
        }
    }

    if let Ok(extracted_dir) = ensure_extracted_scripts() {
        let p = extracted_dir.join("inspect_blend.py");
        if p.exists() {
            return p;
        }
    }

    if let Ok(appdir) = std::env::var("APPDIR") {
        let candidates = [
            PathBuf::from(&appdir).join("usr/share/render-night/python/inspect_blend.py"),
            PathBuf::from(&appdir).join("usr/share/render-night/scripts/inspect_blend.py"),
        ];
        for c in &candidates {
            if c.exists() {
                return c.clone();
            }
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let candidates = [
                parent.join("resources/python/inspect_blend.py"),
                parent.join("scripts/inspect_blend.py"),
                parent.join("../share/render-night/python/inspect_blend.py"),
                parent.join("../share/render-night/scripts/inspect_blend.py"),
                parent.join("../resources/python/inspect_blend.py"),
            ];
            for c in &candidates {
                if c.exists() {
                    return c.clone();
                }
            }
        }
    }

    let sys_candidates = [
        PathBuf::from("/usr/share/render-night/python/inspect_blend.py"),
        PathBuf::from("/usr/share/render-night/scripts/inspect_blend.py"),
        PathBuf::from("/usr/local/share/render-night/python/inspect_blend.py"),
    ];
    for c in &sys_candidates {
        if c.exists() {
            return c.clone();
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dev_candidates = [
        manifest_dir.join("../../resources/python/inspect_blend.py"),
        manifest_dir.join("../resources/python/inspect_blend.py"),
        PathBuf::from("resources/python/inspect_blend.py"),
    ];
    for c in &dev_candidates {
        if c.exists() {
            return c.clone();
        }
    }

    PathBuf::from("resources/python/inspect_blend.py")
}

/// Resolves path to render_runner.py following fallback order:
/// 1. Extracted bundled script in ~/.local/share/render-night/<version>/scripts/
/// 2. Caller-specified resources_path
/// 3. Paths relative to current executable
/// 4. Paths in $APPDIR (AppImage runtime)
/// 5. System install directories (/usr/share/render-night)
/// 6. Manifest / source directory fallbacks
pub fn resolve_render_runner_script_path(resources_path: Option<&Path>) -> PathBuf {
    if let Some(res) = resources_path {
        let p = res.join("python").join("render_runner.py");
        if p.exists() {
            return p;
        }
        let p2 = res.join("scripts").join("render_runner.py");
        if p2.exists() {
            return p2;
        }
    }

    if let Ok(extracted_dir) = ensure_extracted_scripts() {
        let p = extracted_dir.join("render_runner.py");
        if p.exists() {
            return p;
        }
    }

    if let Ok(appdir) = std::env::var("APPDIR") {
        let candidates = [
            PathBuf::from(&appdir).join("usr/share/render-night/python/render_runner.py"),
            PathBuf::from(&appdir).join("usr/share/render-night/scripts/render_runner.py"),
        ];
        for c in &candidates {
            if c.exists() {
                return c.clone();
            }
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let candidates = [
                parent.join("resources/python/render_runner.py"),
                parent.join("scripts/render_runner.py"),
                parent.join("../share/render-night/python/render_runner.py"),
                parent.join("../share/render-night/scripts/render_runner.py"),
                parent.join("../resources/python/render_runner.py"),
            ];
            for c in &candidates {
                if c.exists() {
                    return c.clone();
                }
            }
        }
    }

    let sys_candidates = [
        PathBuf::from("/usr/share/render-night/python/render_runner.py"),
        PathBuf::from("/usr/share/render-night/scripts/render_runner.py"),
        PathBuf::from("/usr/local/share/render-night/python/render_runner.py"),
    ];
    for c in &sys_candidates {
        if c.exists() {
            return c.clone();
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dev_candidates = [
        manifest_dir.join("../../resources/python/render_runner.py"),
        manifest_dir.join("../resources/python/render_runner.py"),
        PathBuf::from("resources/python/render_runner.py"),
    ];
    for c in &dev_candidates {
        if c.exists() {
            return c.clone();
        }
    }

    PathBuf::from("resources/python/render_runner.py")
}
