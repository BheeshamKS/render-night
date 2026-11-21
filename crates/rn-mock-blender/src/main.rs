use rn_mock_blender::args::BlenderArgs;
use rn_mock_blender::fixtures::VERSION_STRING;
use rn_mock_blender::inspector::execute_inspect;
use rn_mock_blender::runner::{execute_direct_render, execute_render_runner};
use rn_mock_blender::scenarios::resolve_scenario;
use std::path::{Path, PathBuf};
use std::process::exit;

fn main() {
    let raw_args: Vec<String> = std::env::args().skip(1).collect();

    let args = match BlenderArgs::parse(&raw_args) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("Error parsing arguments: {e}");
            exit(1);
        }
    };

    // 1. Version request
    if args.version {
        print!("{VERSION_STRING}");
        exit(0);
    }

    let script_str = args
        .python_script
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let first_py_arg = args.python_args.first().cloned().unwrap_or_default();

    let scenario = resolve_scenario(
        args.mock_scenario,
        std::env::var("RN_MOCK_SCENARIO").ok().as_deref(),
        None,
        args.blend_file.as_deref(),
    );

    // 2. Inspection simulation: inspect_blend.py or output JSON after --
    let is_inspect = script_str.contains("inspect_blend.py")
        || (!script_str.contains("render_runner.py")
            && first_py_arg.ends_with(".json")
            && !args.render_animation);

    if is_inspect {
        let out_path = if !first_py_arg.is_empty() {
            PathBuf::from(first_py_arg)
        } else {
            PathBuf::from("inspect-output.json")
        };

        match execute_inspect(args.blend_file.as_deref(), &out_path, scenario) {
            Ok(()) => exit(0),
            Err(code) => exit(code),
        }
    }

    // 3. Render runner simulation: render_runner.py
    if script_str.contains("render_runner.py") {
        if first_py_arg.is_empty() {
            eprintln!("Error: Missing payload path after --");
            exit(1);
        }
        let payload_path = Path::new(&first_py_arg);
        match execute_render_runner(payload_path, args.mock_scenario) {
            Ok(()) => exit(0),
            Err(code) => exit(code),
        }
    }

    // 4. Direct headless render: -b with -a or -f or -s/-e
    if args.background
        && (args.render_animation
            || args.render_still.is_some()
            || args.start_frame.is_some()
            || args.output_pattern.is_some())
    {
        match execute_direct_render(&args, scenario) {
            Ok(()) => exit(0),
            Err(code) => exit(code),
        }
    }

    println!("Mock Blender: unrecognized arguments {:?}", raw_args);
    exit(0);
}
