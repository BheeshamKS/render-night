"""
Render Night - Headless Blend Inspector
Introspects an opened Blender scene and exports RNA metadata and settings to a JSON file.

Invoked via:
  blender -b "<file.blend>" -P inspect_blend.py -- "<out.json>"
"""

import json
import os
import sys

try:
    import bpy
except ImportError:
    # If invoked directly outside Blender
    print("Error: inspect_blend.py must be run inside Blender's python environment.")
    sys.exit(1)


def make_json_safe(val):
    """
    Recursively convert Blender RNA objects, collections, and structs
    into JSON-serializable primitives (dicts, lists, strings, numbers, booleans, None).
    """
    if val is None or isinstance(val, (int, float, bool, str)):
        return val

    # If it's a dictionary / mapping
    if isinstance(val, dict):
        return {str(k): make_json_safe(v) for k, v in val.items()}

    # If it's an iterable sequence / collection (but not string or bytes)
    if hasattr(val, "__iter__") and not isinstance(val, (str, bytes)):
        safe_list = []
        try:
            for item in val:
                safe_list.append(make_json_safe(item))
        except Exception:
            return str(val)
        return safe_list

    # If it's a bpy_struct or complex object with a name or identifier
    if hasattr(val, "name"):
        return str(val.name)
    if hasattr(val, "identifier"):
        return str(val.identifier)

    return str(val)


def introspect_struct(obj):
    """
    Generic RNA introspection over a Blender struct.
    Extracts property values, types, min/max, defaults, and enum options.
    """
    if not obj:
        return {}
    rna_type = getattr(obj, "rna_type", None)
    if not rna_type:
        return {}

    result = {}
    for prop in rna_type.properties:
        prop_id = prop.identifier
        if prop_id in ("rna_type", "name", "is_dirty"):
            continue

        try:
            val = getattr(obj, prop_id)
            safe_val = make_json_safe(val)

            meta = {
                "value": safe_val,
                "type": prop.type,
                "name": prop.name,
                "description": prop.description or "",
            }

            if hasattr(prop, "default"):
                try:
                    def_val = make_json_safe(prop.default)
                    meta["default"] = def_val
                except Exception:
                    pass

            if hasattr(prop, "hard_min"):
                try:
                    meta["min"] = float(prop.hard_min)
                except Exception:
                    pass
            if hasattr(prop, "hard_max"):
                try:
                    meta["max"] = float(prop.hard_max)
                except Exception:
                    pass

            if prop.type == "ENUM" and hasattr(prop, "enum_items"):
                meta["enumItems"] = [
                    {
                        "identifier": item.identifier,
                        "name": item.name,
                        "description": item.description or "",
                    }
                    for item in prop.enum_items
                ]

            result[prop_id] = meta
        except Exception:
            continue

    return result


def get_enum_items(prop):
    """Extract enum item list from an RNA property."""
    if not prop or prop.type != "ENUM" or not hasattr(prop, "enum_items"):
        return []
    return [
        {
            "identifier": item.identifier,
            "name": item.name,
            "description": item.description or "",
        }
        for item in prop.enum_items
    ]


def find_missing_files():
    """Report missing images, external libraries, and audio files."""
    missing = []

    # Images
    for img in bpy.data.images:
        try:
            if img.packed_file or img.source != "FILE" or not img.filepath:
                continue
            abs_path = bpy.path.abspath(img.filepath)
            if not os.path.exists(abs_path):
                missing.append({
                    "path": abs_path,
                    "type": "image",
                    "datablock": img.name,
                })
        except Exception:
            continue

    # Libraries
    for lib in bpy.data.libraries:
        try:
            if not lib.filepath:
                continue
            abs_path = bpy.path.abspath(lib.filepath)
            if not os.path.exists(abs_path):
                missing.append({
                    "path": abs_path,
                    "type": "library",
                    "datablock": lib.name,
                })
        except Exception:
            continue

    # Sounds
    for snd in bpy.data.sounds:
        try:
            if snd.packed_file or not snd.filepath:
                continue
            abs_path = bpy.path.abspath(snd.filepath)
            if not os.path.exists(abs_path):
                missing.append({
                    "path": abs_path,
                    "type": "sound",
                    "datablock": snd.name,
                })
        except Exception:
            continue

    return missing


def get_cycles_devices():
    """Detect compute devices available to Cycles."""
    devices = []
    try:
        cycles_addon = bpy.context.preferences.addons.get("cycles")
        if cycles_addon:
            cprefs = cycles_addon.preferences
            # Refresh devices if possible
            if hasattr(cprefs, "get_devices"):
                cprefs.get_devices()
            if hasattr(cprefs, "devices"):
                for dev in cprefs.devices:
                    devices.append({
                        "id": getattr(dev, "id", dev.name),
                        "name": dev.name,
                        "type": getattr(dev, "type", "CPU"),
                        "use": bool(getattr(dev, "use", True)),
                    })
    except Exception:
        pass

    if not devices:
        devices.append({"name": "CPU", "type": "CPU", "use": True})

    return devices


def main():
    if "--" not in sys.argv:
        print("Error: missing '-- <out.json>' parameter.")
        sys.exit(1)

    out_file = sys.argv[sys.argv.index("--") + 1]

    # Extract Blender app version & file saved version
    blender_version = ".".join(map(str, bpy.app.version))
    # bpy.data.version is (major, minor, file_subversion), e.g. (5, 2, 44)
    # The actual Blender release version corresponding to this file format is major.minor.0
    if hasattr(bpy.data, "version") and len(bpy.data.version) >= 2:
        saved_with_version = f"{bpy.data.version[0]}.{bpy.data.version[1]}.0"
    else:
        saved_with_version = blender_version
    blend_path = bpy.data.filepath or ""

    active_scene_name = (
        bpy.context.scene.name
        if bpy.context.scene
        else (bpy.data.scenes[0].name if bpy.data.scenes else "Scene")
    )

    scenes_data = []
    engine_items = []
    format_items = []
    codec_items = []
    view_transform_items = []
    look_items = []
    device_items = []

    for scene in bpy.data.scenes:
        # Collect cameras in this scene
        cameras = [obj.name for obj in scene.objects if obj.type == "CAMERA"]
        active_camera = scene.camera.name if scene.camera else None

        # Collect view layers
        view_layers = [vl.name for vl in scene.view_layers]

        # RNA whitelisted structs
        render_meta = introspect_struct(scene.render)
        image_meta = introspect_struct(scene.render.image_settings)
        ffmpeg_meta = introspect_struct(getattr(scene.render, "ffmpeg", None))
        cycles_meta = introspect_struct(getattr(scene, "cycles", None))
        eevee_meta = introspect_struct(getattr(scene, "eevee", None))
        view_meta = introspect_struct(scene.view_settings)
        display_meta = introspect_struct(scene.display_settings)

        # Extract top-level dropdown items from active or first scene
        if not engine_items and "engine" in render_meta:
            engine_items = render_meta["engine"].get("enumItems", [])
        if not format_items and "file_format" in image_meta:
            format_items = image_meta["file_format"].get("enumItems", [])
        if not codec_items and "codec" in ffmpeg_meta:
            codec_items = ffmpeg_meta["codec"].get("enumItems", [])
        if not view_transform_items and "view_transform" in view_meta:
            view_transform_items = view_meta["view_transform"].get("enumItems", [])
        if not look_items and "look" in view_meta:
            look_items = view_meta["look"].get("enumItems", [])
        if not device_items and "device" in cycles_meta:
            device_items = cycles_meta["device"].get("enumItems", [])

        scene_dict = {
            "name": scene.name,
            "activeCamera": active_camera,
            "cameras": cameras,
            "viewLayers": view_layers,
            "frameStart": int(scene.frame_start),
            "frameEnd": int(scene.frame_end),
            "frameStep": int(scene.frame_step),
            "fps": int(scene.render.fps),
            "fpsBase": float(scene.render.fps_base),
            "resolutionX": int(scene.render.resolution_x),
            "resolutionY": int(scene.render.resolution_y),
            "resolutionPercentage": int(scene.render.resolution_percentage),
            "render": render_meta,
            "imageSettings": image_meta,
            "ffmpeg": ffmpeg_meta,
            "cycles": cycles_meta,
            "eevee": eevee_meta,
            "viewSettings": view_meta,
            "displaySettings": display_meta,
        }
        scenes_data.append(scene_dict)

    missing_files = find_missing_files()
    cycles_devices = get_cycles_devices()

    output = {
        "schemaVersion": 1,
        "blenderVersion": blender_version,
        "savedWithVersion": saved_with_version,
        "blendPath": blend_path,
        "activeScene": active_scene_name,
        "scenes": scenes_data,
        "missingFiles": missing_files,
        "cyclesDevices": cycles_devices,
        "engineItems": engine_items,
        "formatItems": format_items,
        "codecItems": codec_items,
        "viewTransformItems": view_transform_items,
        "lookItems": look_items,
        "deviceItems": device_items,
    }

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, default=make_json_safe)

    print(f"RN_INSPECT_SUCCESS: {out_file}")


if __name__ == "__main__":
    main()
