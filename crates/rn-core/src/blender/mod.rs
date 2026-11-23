pub mod discovery;
pub mod header_reader;
pub mod inspector;
pub mod scripts;
pub mod version_compare;

pub use discovery::{
    candidate_executables, candidate_executables_for_platform, determine_source,
    discover_all_blenders, discover_all_blenders_with, is_compatible_blender, is_portable,
    parse_blender_version_output, probe_blender, resolve_blender_for_cli, sort_blenders_desc,
    validate_custom_blender, BlenderDiscoveryError, BlenderFs, BlenderInstallation, BlenderProber,
    BlenderSource, EnvLookup, MockBlenderFs, MockBlenderProber, MockEnv, Platform, RealBlenderFs,
    RealBlenderProber, RealEnv,
};
pub use header_reader::{
    parse_blend_header, parse_blend_header_slice, read_blend_header, read_blend_header_fs,
    BlendHeaderInfo, HeaderReadError,
};
pub use inspector::{inspect_blend, InspectOptions};
pub use scripts::{
    ensure_extracted_scripts, get_scripts_dir, resolve_inspect_script_path,
    resolve_render_runner_script_path,
};
pub use version_compare::{
    compare_versions, compare_versions_num, is_blend_version_newer, is_blend_version_str_newer,
    parse_version,
};
