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


def build_scene(output_blend, engine="CYCLES", with_missing_used=False, with_missing_unused=False):
    # Reset to default factory settings
    bpy.ops.wm.read_factory_settings(use_empty=True)

    parent_dir = os.path.dirname(os.path.abspath(output_blend))
    if parent_dir:
        os.makedirs(parent_dir, exist_ok=True)

    # Create Scene
    scene = bpy.context.scene
    scene.name = "Scene"
    scene.frame_start = 1
    scene.frame_end = 10
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
    mat.use_nodes = True
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
        with_used = False
        with_unused = False

        for arg in args:
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

        build_scene(output_blend, engine=engine, with_missing_used=with_used, with_missing_unused=with_unused)
    else:
        import subprocess

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

        cmd = blender_cmd + ["--background", "--python", os.path.abspath(__file__), "--"] + forwarded_args
        res = subprocess.run(cmd)
        sys.exit(res.returncode)


if __name__ == "__main__":
    main()
