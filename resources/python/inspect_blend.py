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


def collect_images_from_node_tree(node_tree, visited=None):
    """Recursively collect image names referenced in a shader, world, compositor or geometry node tree."""
    if not node_tree or not hasattr(node_tree, "nodes"):
        return set()
    if visited is None:
        visited = set()
    if node_tree in visited:
        return set()
    visited.add(node_tree)

    images = set()
    try:
        for node in node_tree.nodes:
            # Direct image reference (e.g. ShaderNodeTexImage, CompositorNodeImage, etc.)
            img = getattr(node, "image", None)
            if img and hasattr(img, "name"):
                images.add(img.name)

            # Node groups
            nested_tree = getattr(node, "node_tree", None)
            if nested_tree and nested_tree not in visited:
                images.update(collect_images_from_node_tree(nested_tree, visited))
    except Exception:
        pass
    return images


def get_used_assets(active_scene=None):
    """
    Determine which images, libraries, and sounds are actually reachable by the render pipeline.
    Returns: (used_images_set, used_libraries_set, used_sounds_set, is_confident_bool)
    """
    used_images = set()
    used_libraries = set()
    used_sounds = set()
    confident = True

    try:
        scene = active_scene or (bpy.context.scene if hasattr(bpy, "context") and bpy.context.scene else None)
        if not scene and hasattr(bpy, "data") and bpy.data.scenes:
            scene = bpy.data.scenes[0]

        if not scene:
            return set(), set(), set(), False

        # 1. World background node tree
        if getattr(scene, "world", None) and getattr(scene.world, "node_tree", None):
            used_images.update(collect_images_from_node_tree(scene.world.node_tree))

        # 2. Compositor node tree (if compositing is enabled)
        use_compositing = getattr(scene.render, "use_compositing", True)
        if use_compositing and getattr(scene, "use_nodes", False) and getattr(scene, "node_tree", None):
            used_images.update(collect_images_from_node_tree(scene.node_tree))

        # 3. Sequencer strips (if sequencer is enabled)
        use_sequencer = getattr(scene.render, "use_sequencer", True)
        if use_sequencer and getattr(scene, "sequence_editor", None):
            seqs = getattr(scene.sequence_editor, "sequences_all", getattr(scene.sequence_editor, "sequences", []))
            for strip in seqs:
                try:
                    strip_sound = getattr(strip, "sound", None)
                    if strip_sound and hasattr(strip_sound, "name"):
                        used_sounds.add(strip_sound.name)
                    strip_elements = getattr(strip, "elements", [])
                    for elem in strip_elements:
                        filename = getattr(elem, "filename", "")
                        if filename:
                            used_images.add(filename)
                except Exception:
                    pass

        # 4. Renderable objects in active view layer
        # Determine excluded collections in the active view layer
        excluded_collections = set()
        active_vl = getattr(scene, "view_layers", None)
        active_layer = None
        if active_vl:
            active_layer = active_vl.get(active_vl.active.name) if getattr(active_vl, "active", None) else active_vl[0]

        if active_layer and hasattr(active_layer, "layer_collection"):
            def scan_layer_col(lc):
                if getattr(lc, "exclude", False) and hasattr(lc, "collection"):
                    excluded_collections.add(lc.collection)
                for child in getattr(lc, "children", []):
                    scan_layer_col(child)
            try:
                scan_layer_col(active_layer.layer_collection)
            except Exception:
                pass

        for obj in getattr(scene, "objects", []):
            try:
                # If hidden from render, skip
                if getattr(obj, "hide_render", False):
                    continue

                # If object belongs exclusively to excluded collections, skip
                obj_cols = getattr(obj, "users_collection", [])
                if obj_cols and all(col in excluded_collections for col in obj_cols):
                    continue

                # Inspect object materials
                for mat_slot in getattr(obj, "material_slots", []):
                    mat = getattr(mat_slot, "material", None)
                    if mat and getattr(mat, "use_nodes", False) and getattr(mat, "node_tree", None):
                        used_images.update(collect_images_from_node_tree(mat.node_tree))

                # Inspect modifiers (Geometry Nodes, Displace, etc.)
                for mod in getattr(obj, "modifiers", []):
                    node_group = getattr(mod, "node_group", None)
                    if node_group:
                        used_images.update(collect_images_from_node_tree(node_group))
                    tex = getattr(mod, "texture", None)
                    if tex and getattr(tex, "image", None):
                        used_images.add(tex.image.name)
            except Exception:
                confident = False

        # 5. Linked libraries (via user_map)
        try:
            if hasattr(bpy.data, "user_map") and hasattr(bpy.data, "libraries"):
                umap = bpy.data.user_map()
                for lib in bpy.data.libraries:
                    # A library is in use if any of its linked datablocks have active users
                    lib_in_use = False
                    for db_collection in (bpy.data.objects, bpy.data.materials, bpy.data.collections, bpy.data.meshes):
                        for item in db_collection:
                            if getattr(item, "library", None) == lib:
                                users = umap.get(item, set())
                                if users:
                                    lib_in_use = True
                                    break
                        if lib_in_use:
                            break
                    if lib_in_use:
                        used_libraries.add(lib.name)
        except Exception:
            confident = False

    except Exception:
        confident = False

    return used_images, used_libraries, used_sounds, confident


def find_missing_files(active_scene=None):
    """
    Report missing images, external libraries, and audio files,
    classifying each as 'used', 'unused', or 'unknown'.
    """
    missing = []
    used_images, used_libraries, used_sounds, confident = get_used_assets(active_scene)

    # Images
    for img in getattr(bpy.data, "images", []):
        try:
            if img.packed_file or getattr(img, "source", "") != "FILE" or not getattr(img, "filepath", ""):
                continue
            abs_path = bpy.path.abspath(img.filepath)
            if not os.path.exists(abs_path):
                if confident:
                    relevance = "used" if (img.name in used_images or os.path.basename(abs_path) in used_images) else "unused"
                else:
                    relevance = "unknown"

                missing.append({
                    "path": abs_path,
                    "type": "image",
                    "datablock": img.name,
                    "relevance": relevance,
                })
        except Exception:
            continue

    # Libraries
    for lib in getattr(bpy.data, "libraries", []):
        try:
            if not getattr(lib, "filepath", ""):
                continue
            abs_path = bpy.path.abspath(lib.filepath)
            if not os.path.exists(abs_path):
                if confident:
                    relevance = "used" if lib.name in used_libraries else "unused"
                else:
                    relevance = "unknown"

                missing.append({
                    "path": abs_path,
                    "type": "library",
                    "datablock": lib.name,
                    "relevance": relevance,
                })
        except Exception:
            continue

    # Sounds
    for snd in getattr(bpy.data, "sounds", []):
        try:
            if snd.packed_file or not getattr(snd, "filepath", ""):
                continue
            abs_path = bpy.path.abspath(snd.filepath)
            if not os.path.exists(abs_path):
                if confident:
                    relevance = "used" if snd.name in used_sounds else "unused"
                else:
                    relevance = "unknown"

                missing.append({
                    "path": abs_path,
                    "type": "sound",
                    "datablock": snd.name,
                    "relevance": relevance,
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
    errors = []

    # 1. Extract Blender app version & file saved version
    try:
        blender_version = ".".join(map(str, bpy.app.version))
    except Exception as exc:
        blender_version = "4.2.0"
        errors.append(f"Blender version detection error: {exc}")

    try:
        if hasattr(bpy.data, "version") and len(bpy.data.version) >= 2:
            saved_with_version = f"{bpy.data.version[0]}.{bpy.data.version[1]}.0"
        else:
            saved_with_version = blender_version
    except Exception as exc:
        saved_with_version = blender_version
        errors.append(f"Saved-with version detection error: {exc}")

    blend_path = getattr(bpy.data, "filepath", "") or ""

    try:
        active_scene_name = (
            bpy.context.scene.name
            if getattr(bpy, "context", None) and bpy.context.scene
            else (bpy.data.scenes[0].name if hasattr(bpy.data, "scenes") and bpy.data.scenes else "Scene")
        )
    except Exception as exc:
        active_scene_name = "Scene"
        errors.append(f"Active scene detection error: {exc}")

    scenes_data = []
    engine_items = []
    format_items = []
    codec_items = []
    view_transform_items = []
    look_items = []
    device_items = []

    # 2. Inspect scenes
    try:
        for scene in getattr(bpy.data, "scenes", []):
            try:
                # Collect cameras in this scene
                cameras = [obj.name for obj in getattr(scene, "objects", []) if getattr(obj, "type", "") == "CAMERA"]
                active_camera = scene.camera.name if getattr(scene, "camera", None) else None

                # Collect view layers
                view_layers = [vl.name for vl in getattr(scene, "view_layers", [])]

                # RNA whitelisted structs
                render_meta = introspect_struct(getattr(scene, "render", None))
                image_meta = introspect_struct(getattr(scene.render, "image_settings", None)) if hasattr(scene, "render") else {}
                ffmpeg_meta = introspect_struct(getattr(scene.render, "ffmpeg", None)) if hasattr(scene, "render") else {}
                cycles_meta = introspect_struct(getattr(scene, "cycles", None))
                eevee_meta = introspect_struct(getattr(scene, "eevee", None))
                view_meta = introspect_struct(getattr(scene, "view_settings", None))
                display_meta = introspect_struct(getattr(scene, "display_settings", None))

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
                    "name": getattr(scene, "name", "Scene"),
                    "activeCamera": active_camera,
                    "cameras": cameras,
                    "viewLayers": view_layers,
                    "frameStart": int(getattr(scene, "frame_start", 1)),
                    "frameEnd": int(getattr(scene, "frame_end", 250)),
                    "frameStep": int(getattr(scene, "frame_step", 1)),
                    "fps": int(getattr(scene.render, "fps", 24)) if hasattr(scene, "render") else 24,
                    "fpsBase": float(getattr(scene.render, "fps_base", 1.0)) if hasattr(scene, "render") else 1.0,
                    "resolutionX": int(getattr(scene.render, "resolution_x", 1920)) if hasattr(scene, "render") else 1920,
                    "resolutionY": int(getattr(scene.render, "resolution_y", 1080)) if hasattr(scene, "render") else 1080,
                    "resolutionPercentage": int(getattr(scene.render, "resolution_percentage", 100)) if hasattr(scene, "render") else 100,
                    "render": render_meta,
                    "imageSettings": image_meta,
                    "ffmpeg": ffmpeg_meta,
                    "cycles": cycles_meta,
                    "eevee": eevee_meta,
                    "viewSettings": view_meta,
                    "displaySettings": display_meta,
                }
                scenes_data.append(scene_dict)
            except Exception as scene_exc:
                errors.append(f"Scene '{getattr(scene, 'name', 'unknown')}' introspection error: {scene_exc}")
    except Exception as scenes_exc:
        errors.append(f"Scenes collection error: {scenes_exc}")

    # Fallback default scene if scenes_data is empty
    if not scenes_data:
        scenes_data.append({
            "name": "Scene",
            "activeCamera": None,
            "cameras": [],
            "viewLayers": ["ViewLayer"],
            "frameStart": 1,
            "frameEnd": 250,
            "frameStep": 1,
            "fps": 24,
            "fpsBase": 1.0,
            "resolutionX": 1920,
            "resolutionY": 1080,
            "resolutionPercentage": 100,
            "render": {},
            "imageSettings": {},
            "ffmpeg": {},
            "cycles": {},
            "eevee": {},
            "viewSettings": {},
            "displaySettings": {},
        })

    # 3. Missing files with relevance
    missing_files = []
    try:
        active_scene_obj = None
        if hasattr(bpy.data, "scenes"):
            for s in bpy.data.scenes:
                if s.name == active_scene_name:
                    active_scene_obj = s
                    break
        missing_files = find_missing_files(active_scene_obj)
    except Exception as miss_exc:
        errors.append(f"Missing files inspection error: {miss_exc}")

    # 4. Cycles devices
    cycles_devices = []
    try:
        cycles_devices = get_cycles_devices()
    except Exception as dev_exc:
        errors.append(f"Cycles devices inspection error: {dev_exc}")
        cycles_devices = [{"name": "CPU", "type": "CPU", "use": True}]

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
        "errors": errors,
    }

    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, default=make_json_safe)

    print(f"RN_INSPECT_SUCCESS: {out_file}")


if __name__ == "__main__":
    main()
