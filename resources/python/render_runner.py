"""
Render Night - Headless Blender Render Runner
Invoked by Render Night:
  blender -b "<file.blend>" -P render_runner.py -- "<payload.json>"

Applies render settings, overrides diff and device configuration purely in memory.
NEVER calls bpy.ops.wm.save_mainfile.
Periodically inspects control.json sentinel channel between frames.
Emits structured RN_EVENT JSON lines on stdout.
"""

import json
import os
import re
import sys
import time

try:
    import bpy
except ImportError:
    bpy = None


def emit_event(event_dict):
    """Emit a structured event line with RN_EVENT prefix."""
    print(f"RN_EVENT {json.dumps(event_dict, default=str)}", flush=True)


def check_control(control_file):
    """Check the sentinel control file for continue / pause / stop commands."""
    if not control_file or not os.path.exists(control_file):
        return "continue"
    try:
        with open(control_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            cmd = data.get("command", "continue")
            if cmd in ("continue", "pause", "stop"):
                return cmd
    except Exception:
        pass
    return "continue"


def compute_frame_filepath(pattern, frame):
    """Expand #### tokens to zero-padded frame numbers."""
    if "#" in pattern:
        def repl(match):
            hashes = match.group(0)
            return f"{frame:0{len(hashes)}d}"
        return re.sub(r"#+", repl, pattern)
    base, ext = os.path.splitext(pattern)
    return f"{base}_{frame:04d}{ext}"


def setup_devices(scene, device_prefs, threads=None):
    """Configure Cycles or EEVEE compute devices and return a device_report dict."""
    engine = getattr(scene.render, "engine", "BLENDER_EEVEE")
    if engine == "CYCLES":
        pref_type = device_prefs.get("deviceType") if device_prefs else None
        enable_gpu = device_prefs.get("enableGpu", True) if device_prefs else True
        selected_device_names = device_prefs.get("selectedDevices") if device_prefs else None

        cprefs = None
        devices_list = []
        enabled_gpu = False

        try:
            cprefs = bpy.context.preferences.addons["cycles"].preferences
            if enable_gpu and pref_type:
                try:
                    cprefs.compute_device_type = pref_type
                except Exception:
                    pass
            try:
                cprefs.get_devices()
            except Exception:
                pass

            for d in getattr(cprefs, "devices", []):
                use = False
                if enable_gpu and d.type != "CPU":
                    if selected_device_names:
                        use = d.name in selected_device_names
                    elif pref_type:
                        use = (d.type == pref_type)
                    else:
                        use = True
                elif not enable_gpu and d.type == "CPU":
                    use = True

                try:
                    d.use = use
                except Exception:
                    pass

                if use and d.type != "CPU":
                    enabled_gpu = True
                devices_list.append({"name": d.name, "type": d.type, "use": bool(use)})
        except Exception:
            pass

        fallback_to_cpu = False
        if enable_gpu and not enabled_gpu:
            fallback_to_cpu = True
            try:
                scene.cycles.device = "CPU"
            except Exception:
                pass
            mode = "CPU"
        elif enable_gpu and enabled_gpu:
            try:
                scene.cycles.device = "GPU"
            except Exception:
                pass
            mode = "GPU"
        else:
            try:
                scene.cycles.device = "CPU"
            except Exception:
                pass
            mode = "CPU"

        if threads:
            try:
                scene.render.threads_mode = "FIXED"
                scene.render.threads = int(threads)
            except Exception:
                pass

        return {
            "type": "device_report",
            "computeDeviceType": getattr(cprefs, "compute_device_type", "NONE") if cprefs else "NONE",
            "engine": engine,
            "mode": mode,
            "devices": devices_list,
            "requestedGpu": bool(enable_gpu),
            "fallbackToCpu": bool(fallback_to_cpu),
            "threads": getattr(scene.render, "threads", None)
        }
    else:
        mode = "GPU" if "EEVEE" in engine else "OPENGL"
        return {
            "type": "device_report",
            "computeDeviceType": "NONE",
            "engine": engine,
            "mode": mode,
            "devices": [],
            "requestedGpu": False,
            "fallbackToCpu": False,
            "threads": getattr(scene.render, "threads", None)
        }


def apply_overrides(scene, overrides):
    """Apply RNA overrides diff in memory and report applied vs skipped."""
    applied = []
    skipped = []
    for rna_path, value in overrides.items():
        try:
            parts = rna_path.split(".")
            if parts[0] == "scene":
                target = scene
                prop_parts = parts[1:]
            else:
                target = bpy.data
                prop_parts = parts

            for p in prop_parts[:-1]:
                target = getattr(target, p)
            prop_name = prop_parts[-1]
            setattr(target, prop_name, value)
            applied.append({"rnaPath": rna_path, "value": value})
        except Exception as exc:
            skipped.append({"rnaPath": rna_path, "reason": str(exc)})

    return {"type": "overrides_report", "applied": applied, "skipped": skipped}


def run_pre_render_hook(scene, hook):
    """Run an optional per-job pre-render Python hook before rendering frames."""
    if not hook or not str(hook).strip():
        return
    emit_event({"type": "pre_render_hook_start"})
    try:
        hook_code = str(hook)
        if os.path.exists(hook_code) and os.path.isfile(hook_code):
            with open(hook_code, "r", encoding="utf-8") as f:
                hook_code = f.read()
        global_scope = {"bpy": bpy, "scene": scene, "__name__": "__main__"}
        exec(compile(hook_code, "<pre_render_hook>", "exec"), global_scope)
        emit_event({"type": "pre_render_hook_success", "hook": str(hook)})
    except Exception as exc:
        import traceback
        tb = traceback.format_exc()
        emit_event({"type": "pre_render_hook_error", "hook": str(hook), "error": str(exc), "traceback": tb})
        print(f"Pre-render hook error: {exc}\n{tb}", file=sys.stderr)
        raise exc


def main():
    if not bpy:
        print("Error: bpy module not available. Must run inside Blender.", file=sys.stderr)
        sys.exit(1)

    argv = sys.argv
    if "--" not in argv:
        print("Error: No payload passed after '--'", file=sys.stderr)
        sys.exit(1)

    payload_path = argv[argv.index("--") + 1]
    if not os.path.exists(payload_path):
        print(f"Error: Payload file '{payload_path}' not found", file=sys.stderr)
        sys.exit(1)

    with open(payload_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    # 1. Select Scene
    scene_name = payload.get("scene")
    scene = None
    if scene_name and scene_name in bpy.data.scenes:
        scene = bpy.data.scenes[scene_name]
    else:
        scene = bpy.context.scene

    # 2. Select Camera
    camera_name = payload.get("camera")
    if camera_name and camera_name in bpy.data.objects:
        scene.camera = bpy.data.objects[camera_name]

    # 3. View Layers
    view_layers = payload.get("viewLayers")
    if view_layers and hasattr(scene, "view_layers"):
        for layer in scene.view_layers:
            layer.use = (layer.name in view_layers)

    # 4. Device Configuration
    device_report = setup_devices(
        scene,
        payload.get("devicePreferences", {}),
        payload.get("threads")
    )
    emit_event(device_report)

    # 5. Overrides
    overrides_report = apply_overrides(scene, payload.get("overrides", {}))
    emit_event(overrides_report)

    # 5b. Pre-Render Hook (trusted code)
    pre_render_hook = payload.get("preRenderHook")
    if pre_render_hook:
        run_pre_render_hook(scene, pre_render_hook)

    # 6. Job Start
    frames = payload.get("frames", [int(scene.frame_current)])
    emit_event({
        "type": "job_start",
        "totalFrames": len(frames),
        "frames": frames,
        "scene": scene.name,
        "camera": scene.camera.name if scene.camera else None,
        "engine": scene.render.engine
    })

    control_file = payload.get("controlFile")
    completed_count = 0
    failed_count = 0
    t_job_start = time.time()

    is_video = getattr(scene.render.image_settings, "file_format", "") in (
        "FFMPEG", "AVI_JPEG", "AVI_RAW", "THEORA", "QUICKTIME", "H264"
    )

    if is_video:
        # Video animation rendering - atomic render without frame-by-frame pause
        scene.frame_start = frames[0]
        scene.frame_end = frames[-1]
        scene.render.filepath = payload.get("outputPattern", scene.render.filepath)
        try:
            bpy.ops.render.render(animation=True, scene=scene.name)
            completed_count = len(frames)
        except Exception as err:
            emit_event({"type": "frame_error", "frame": frames[0], "message": str(err)})
            failed_count = len(frames)
    else:
        # Still images - render frame by frame
        for idx, frame in enumerate(frames):
            # Check control channel before frame
            while True:
                cmd = check_control(control_file)
                if cmd == "stop":
                    break
                if cmd == "pause":
                    time.sleep(0.2)
                    continue
                break

            if cmd == "stop":
                break

            emit_event({
                "type": "frame_start",
                "frame": frame,
                "scene": scene.name,
                "frameIndex": idx,
                "totalFrames": len(frames)
            })

            scene.frame_set(frame)
            frame_filepath = compute_frame_filepath(payload.get("outputPattern", scene.render.filepath), frame)
            scene.render.filepath = frame_filepath

            t_frame_start = time.time()
            try:
                bpy.ops.render.render(write_still=True, scene=scene.name)
                dt = time.time() - t_frame_start
                actual_saved = frame_filepath
                if not os.path.exists(actual_saved):
                    for ext in (".png", ".jpg", ".exr", ".tif", ".webp"):
                        if os.path.exists(frame_filepath + ext):
                            actual_saved = frame_filepath + ext
                            break

                emit_event({
                    "type": "frame_done",
                    "frame": frame,
                    "scene": scene.name,
                    "saved": actual_saved,
                    "timeSeconds": round(dt, 2)
                })
                completed_count += 1
            except Exception as err:
                emit_event({"type": "frame_error", "frame": frame, "message": str(err)})
                failed_count += 1

    total_duration = time.time() - t_job_start
    emit_event({
        "type": "job_done",
        "completedFrames": completed_count,
        "failedFrames": failed_count,
        "durationSeconds": round(total_duration, 2)
    })


if __name__ == "__main__":
    main()
