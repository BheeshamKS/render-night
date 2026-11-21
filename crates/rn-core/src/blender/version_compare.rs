use std::cmp::Ordering;

/// Parses a version string like "4.2.0", "v3.6", "4.0.1-alpha", or "4.2" into numeric components (major, minor, patch).
pub fn parse_version(version_str: &str) -> (u32, u32, u32) {
    let trimmed = version_str.trim();
    let cleaned = trimmed
        .strip_prefix(|c| c == 'v' || c == 'V')
        .unwrap_or(trimmed);
    let bare = cleaned.split(['-', '+']).next().unwrap_or(cleaned);

    let mut parts = bare.split('.').map(|p| p.parse::<u32>().unwrap_or(0));

    let major = parts.next().unwrap_or(0);
    let minor = parts.next().unwrap_or(0);
    let patch = parts.next().unwrap_or(0);

    (major, minor, patch)
}

/// Compares two version strings. Returns Ordering::Greater if v1 > v2, Ordering::Less if v1 < v2, Ordering::Equal if equal.
pub fn compare_versions(v1: &str, v2: &str) -> Ordering {
    let (maj1, min1, pat1) = parse_version(v1);
    let (maj2, min2, pat2) = parse_version(v2);

    maj1.cmp(&maj2)
        .then_with(|| min1.cmp(&min2))
        .then_with(|| pat1.cmp(&pat2))
}

/// Legacy numeric version compare (-1, 0, 1).
pub fn compare_versions_num(v1: &str, v2: &str) -> i32 {
    match compare_versions(v1, v2) {
        Ordering::Greater => 1,
        Ordering::Less => -1,
        Ordering::Equal => 0,
    }
}

/// Checks if a .blend file was saved with a strictly newer major/minor version of Blender
/// than the target Blender executable version.
///
/// Returns true iff saved_major > target_major || (saved_major == target_major && saved_minor > target_minor).
/// Patch version differences are completely forward-compatible in Blender.
pub fn is_blend_version_newer(
    saved_major: u32,
    saved_minor: u32,
    target_major: u32,
    target_minor: u32,
) -> bool {
    if saved_major > target_major {
        return true;
    }
    if saved_major == target_major && saved_minor > target_minor {
        return true;
    }
    false
}

/// String-based convenience overload of is_blend_version_newer.
pub fn is_blend_version_str_newer(saved_version: &str, target_version: &str) -> bool {
    let (saved_maj, saved_min, _) = parse_version(saved_version);
    let (target_maj, target_min, _) = parse_version(target_version);
    is_blend_version_newer(saved_maj, saved_min, target_maj, target_min)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compare_versions() {
        assert_eq!(compare_versions("4.2.0", "3.6.0"), Ordering::Greater);
        assert_eq!(compare_versions("3.6.0", "4.2.0"), Ordering::Less);
        assert_eq!(compare_versions("4.2.0", "4.2.0"), Ordering::Equal);
        assert_eq!(compare_versions("4.2.1", "4.2.0"), Ordering::Greater);
        assert_eq!(compare_versions("4.2", "4.2.0"), Ordering::Equal);
        assert_eq!(compare_versions("v3.6", "3.6.0"), Ordering::Equal);
        assert_eq!(compare_versions("4.1.2-alpha", "4.1.2"), Ordering::Equal);
        assert_eq!(compare_versions_num("4.2.0", "3.6.0"), 1);
        assert_eq!(compare_versions_num("3.6.0", "4.2.0"), -1);
        assert_eq!(compare_versions_num("4.2.0", "4.2.0"), 0);
    }

    #[test]
    fn test_forward_compatibility() {
        // Same major.minor is forward compatible even with patch diffs
        assert!(!is_blend_version_newer(5, 2, 5, 2));
        assert!(!is_blend_version_str_newer("5.2.44", "5.2.0"));
        assert!(!is_blend_version_str_newer("4.2.17", "4.2.0"));

        // Saved is newer major -> forward incompatible warning
        assert!(is_blend_version_newer(5, 0, 4, 2));
        assert!(is_blend_version_newer(6, 0, 5, 2));

        // Saved is newer minor -> forward incompatible warning
        assert!(is_blend_version_newer(5, 3, 5, 2));

        // Saved is older -> backward compatible (no warning)
        assert!(!is_blend_version_newer(4, 2, 5, 2));
        assert!(!is_blend_version_newer(3, 6, 5, 2));
    }
}
