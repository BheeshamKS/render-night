use std::process::Command;

fn main() {
    let pkg_version = env!("CARGO_PKG_VERSION");
    let sha = std::env::var("RN_GIT_SHA")
        .ok()
        .or_else(|| {
            Command::new("git")
                .args(["rev-parse", "--short", "HEAD"])
                .output()
                .ok()
                .and_then(|out| {
                    if out.status.success() {
                        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
                        if !s.is_empty() {
                            Some(s)
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                })
        })
        .unwrap_or_else(|| "unknown".to_string());

    let build_time = chrono::Utc::now().to_rfc3339();
    let full_version = format!("{} (sha {})", pkg_version, sha);

    println!("cargo:rustc-env=RN_GIT_SHA={}", sha);
    println!("cargo:rustc-env=RN_FULL_VERSION={}", full_version);
    println!("cargo:rustc-env=RN_BUILD_TIME={}", build_time);
    println!("cargo:rerun-if-env-changed=RN_GIT_SHA");
}
