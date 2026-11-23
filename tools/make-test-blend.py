#!/usr/bin/env python3
"""
tools/make-test-blend.py
Produces a tiny self-contained .blend file for Render Night E2E testing:
- 10 frames (1..10)
- 32x32 resolution
- Cube + Camera + Light
- Cycles or Eevee, 1 sample, fast render
- Optional used and unused missing textures for pre-flight testing
"""
import os
import sys

try:
    import bpy

    IN_BLENDER = True
except ImportError:
    IN_BLENDER = False


def build_scene(
    output_blend,
    engine="CYCLES",
    frame_start=1,
    frame_end=10,
    with_missing_used=False,
    with_missing_unused=False,
    with_missing_lib=False,
):
    # Reset to default factory settings
    bpy.ops.wm.read_factory_settings(use_empty=True)

    parent_dir = os.path.dirname(os.path.abspath(output_blend))
    if parent_dir:
        os.makedirs(parent_dir, exist_ok=True)

    # Create Scene
    scene = bpy.context.scene
    scene.name = "Scene"
    scene.frame_start = frame_start
    scene.frame_end = frame_end
    scene.render.resolution_x = 32
    scene.render.resolution_y = 32
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"

    # Engine & Samples
    if engine == "CYCLES":
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 1
        scene.cycles.preview_samples = 1
        scene.cycles.max_bounces = 1
        scene.cycles.device = "CPU"
    else:
        for candidate in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
            try:
                scene.render.engine = candidate
                break
            except Exception:
                pass

    # Create Camera
    cam_data = bpy.data.cameras.new(name="Camera")
    cam_obj = bpy.data.objects.new(name="Camera", object_data=cam_data)
    cam_obj.location = (0.0, -5.0, 2.0)
    cam_obj.rotation_euler = (1.2, 0.0, 0.0)
    bpy.context.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    # Create Light
    light_data = bpy.data.lights.new(name="Light", type="SUN")
    light_obj = bpy.data.objects.new(name="Light", object_data=light_data)
    light_obj.location = (2.0, 2.0, 5.0)
    bpy.context.collection.objects.link(light_obj)

    # Create Cube Mesh
    mesh = bpy.data.meshes.new(name="Cube")
    cube_obj = bpy.data.objects.new(name="Cube", object_data=mesh)
    bpy.context.collection.objects.link(cube_obj)

    import bmesh

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    bm.to_mesh(mesh)
    bm.free()

    # Material
    mat = bpy.data.materials.new(name="CubeMaterial")
    try:
        mat.use_nodes = True
    except Exception:
        pass
    cube_obj.data.materials.append(mat)

    # Add used missing texture if requested
    if with_missing_used:
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        tex_node = nodes.new(type="ShaderNodeTexImage")
        tex_node.location = (-300, 200)
        dummy_path = os.path.join(parent_dir, "missing_used_texture.png")
        with open(dummy_path, "wb") as f:
            f.write(b"")
        img = bpy.data.images.load(dummy_path)
        img.filepath = "//missing_used_texture.png"
        if os.path.exists(dummy_path):
            os.remove(dummy_path)
        tex_node.image = img
        bsdf = nodes.get("Principled BSDF")
        if bsdf:
            links.new(tex_node.outputs.get("Color"), bsdf.inputs.get("Base Color"))

    # Add unused missing texture if requested
    if with_missing_unused:
        dummy_path = os.path.join(parent_dir, "missing_unused_texture.png")
        with open(dummy_path, "wb") as f:
            f.write(b"")
        unused_img = bpy.data.images.load(dummy_path)
        unused_img.filepath = "//missing_unused_texture.png"
        unused_img.use_fake_user = True
        if os.path.exists(dummy_path):
            os.remove(dummy_path)

    # Add missing linked library if requested
    if with_missing_lib:
        dummy_lib_path = os.path.join(parent_dir, "missing_dummy_lib.blend")
        # Save current scene as dummy lib, then reload factory settings
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(dummy_lib_path))
        bpy.ops.wm.read_factory_settings(use_empty=True)

        # Now link the dummy lib into a new scene
        try:
            with bpy.data.libraries.load(dummy_lib_path, link=True) as (
                data_from,
                data_to,
            ):
                data_to.objects = data_from.objects
        except Exception as e:
            print(f"Library link warning: {e}")

        # Point library filepath to missing path
        for lib in bpy.data.libraries:
            lib.filepath = "//missing_external_library.blend"

        if os.path.exists(dummy_lib_path):
            os.remove(dummy_lib_path)

    # Save .blend
    parent_dir = os.path.dirname(os.path.abspath(output_blend))
    if parent_dir:
        os.makedirs(parent_dir, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(output_blend))
    print(f"Successfully generated test blend file: {output_blend}")


def main():
    if IN_BLENDER:
        args = sys.argv
        if "--" in args:
            args = args[args.index("--") + 1 :]
        else:
            args = []

        output_blend = "test_cube.blend"
        engine = "CYCLES"
        frame_start = 1
        frame_end = 10
        with_used = False
        with_unused = False
        with_lib = False

        i = 0
        while i < len(args):
            arg = args[i]
            if arg.endswith(".blend"):
                output_blend = arg
            elif arg in ("--cycles", "CYCLES"):
                engine = "CYCLES"
            elif arg in ("--eevee", "EEVEE"):
                engine = "EEVEE"
            elif arg == "--missing-used":
                with_used = True
            elif arg == "--missing-unused":
                with_unused = True
            elif arg == "--missing-lib":
                with_lib = True
            elif arg == "--frame-start" and i + 1 < len(args):
                frame_start = int(args[i + 1])
                i += 1
            elif arg == "--frame-end" and i + 1 < len(args):
                frame_end = int(args[i + 1])
                i += 1
            i += 1

        build_scene(
            output_blend,
            engine=engine,
            frame_start=frame_start,
            frame_end=frame_end,
            with_missing_used=with_used,
            with_missing_unused=with_unused,
            with_missing_lib=with_lib,
        )
    else:
        import subprocess

        # Check for --generate-all
        if "--generate-all" in sys.argv:
            idx = sys.argv.index("--generate-all")
            out_dir = (
                sys.argv[idx + 1]
                if idx + 1 < len(sys.argv)
                else os.path.join("tests", "fixtures")
            )
            out_dir = os.path.abspath(out_dir)
            os.makedirs(out_dir, exist_ok=True)

            print(f"Generating full test fixture suite in: {out_dir}")

            # 1. newer-version.blend (header stub with v99.9)
            newer_path = os.path.join(out_dir, "newer-version.blend")
            with open(newer_path, "wb") as f:
                f.write(b"BLENDER-v999\x00\x00\x00\x00" + b"\x00" * 128)
            print(f"Generated synthetic fixture: {newer_path}")

            # 2. corrupt.blend (invalid non-blend binary data)
            corrupt_path = os.path.join(out_dir, "corrupt.blend")
            with open(corrupt_path, "wb") as f:
                f.write(b"NOT_A_VALID_BLEND_CORRUPT_HEADER_AND_BODY_PAYLOAD_TEST")
            print(f"Generated synthetic fixture: {corrupt_path}")

            # 3. inspect-crash.blend (inspect failure trigger)
            crash_path = os.path.join(out_dir, "inspect-crash.blend")
            with open(crash_path, "wb") as f:
                f.write(b"BLENDER-v402\x00\x00\x00\x00" + b"CRASH_ON_INSPECT")
            print(f"Generated synthetic fixture: {crash_path}")

            # Find blender executable
            blender_cmd = []
            if os.system("which blender > /dev/null 2>&1") == 0:
                blender_cmd = ["blender"]
            elif os.system("flatpak info org.blender.Blender > /dev/null 2>&1") == 0:
                blender_cmd = ["flatpak", "run", "org.blender.Blender"]
            else:
                print(
                    "Warning: No blender executable found; generated only synthetic fixtures.",
                    file=sys.stderr,
                )
                sys.exit(0)

            # Generate real blender scenes
            targets = [
                (
                    os.path.join(out_dir, "blank.blend"),
                    ["--eevee", "--frame-start", "1", "--frame-end", "3"],
                ),
                (os.path.join(out_dir, "eevee-basic.blend"), ["--eevee"]),
                (
                    os.path.join(out_dir, "eevee-missing-used-texture.blend"),
                    ["--eevee", "--missing-used"],
                ),
                (
                    os.path.join(out_dir, "eevee-missing-unused-texture.blend"),
                    ["--eevee", "--missing-unused"],
                ),
                (
                    os.path.join(out_dir, "missing-library.blend"),
                    ["--eevee", "--missing-lib"],
                ),
            ]

            this_script = os.path.abspath(__file__)
            for out_file, extra_args in targets:
                cmd = (
                    blender_cmd
                    + ["--background", "--python", this_script, "--", out_file]
                    + extra_args
                )
                print(f"Building {out_file}...")
                subprocess.run(cmd, check=True)

            print("All 7 test fixtures generated successfully!")
            sys.exit(0)

        blender_cmd = []
        if os.system("which blender > /dev/null 2>&1") == 0:
            blender_cmd = ["blender"]
        elif os.system("flatpak info org.blender.Blender > /dev/null 2>&1") == 0:
            blender_cmd = ["flatpak", "run", "org.blender.Blender"]
        else:
            print("Error: No blender executable found", file=sys.stderr)
            sys.exit(1)

        forwarded_args = []
        for arg in sys.argv[1:]:
            if arg.endswith(".blend") or not arg.startswith("-"):
                forwarded_args.append(os.path.abspath(arg))
            else:
                forwarded_args.append(arg)

        cmd = (
            blender_cmd
            + ["--background", "--python", os.path.abspath(__file__), "--"]
            + forwarded_args
        )
        res = subprocess.run(cmd)
        sys.exit(res.returncode)


if __name__ == "__main__":
    main()
