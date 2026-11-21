use serde_json::{json, Value};

pub const VERSION_STRING: &str = "Blender 4.2.0 LTS (sub 0)\n    \
build date: 2024-07-16\n    \
build time: 06:19:15\n    \
build commit date: 2024-07-16\n    \
build commit time: 06:19\n    \
build hash: a51f305417fb\n    \
build platform: Linux\n";

pub fn create_default_inspect_output(blend_path: &str) -> Value {
    json!({
        "schemaVersion": 1,
        "blenderVersion": "4.2.0",
        "savedWithVersion": "4.2.0",
        "blendPath": blend_path,
        "activeScene": "Scene",
        "scenes": [
            {
                "name": "Scene",
                "activeCamera": "Camera",
                "cameras": ["Camera", "Camera.001"],
                "viewLayers": ["ViewLayer"],
                "frameStart": 1,
                "frameEnd": 250,
                "frameStep": 1,
                "fps": 24,
                "fpsBase": 1.0,
                "resolutionX": 1920,
                "resolutionY": 1080,
                "resolutionPercentage": 100,
                "render": {
                    "engine": {
                        "value": "CYCLES",
                        "type": "ENUM",
                        "name": "Engine",
                        "enumItems": [
                            { "identifier": "CYCLES", "name": "Cycles" },
                            { "identifier": "BLENDER_EEVEE_NEXT", "name": "EEVEE" }
                        ]
                    },
                    "filepath": {
                        "value": "//render/{project}/{scene}_{camera}_####.png",
                        "type": "STRING",
                        "name": "File Path"
                    }
                },
                "imageSettings": {
                    "file_format": {
                        "value": "PNG",
                        "type": "ENUM",
                        "name": "File Format",
                        "enumItems": [
                            { "identifier": "PNG", "name": "PNG" },
                            { "identifier": "OPEN_EXR", "name": "OpenEXR" }
                        ]
                    },
                    "color_mode": { "value": "RGBA", "type": "ENUM", "name": "Color Mode" }
                },
                "ffmpeg": {},
                "cycles": {
                    "device": {
                        "value": "GPU",
                        "type": "ENUM",
                        "name": "Device",
                        "enumItems": [
                            { "identifier": "CPU", "name": "CPU" },
                            { "identifier": "GPU", "name": "GPU Compute" }
                        ]
                    },
                    "samples": { "value": 128, "type": "INT", "name": "Samples", "min": 1, "max": 100000 }
                },
                "eevee": {},
                "viewSettings": {
                    "view_transform": {
                        "value": "AgX",
                        "type": "ENUM",
                        "name": "View Transform",
                        "enumItems": [
                            { "identifier": "Standard", "name": "Standard" },
                            { "identifier": "AgX", "name": "AgX" }
                        ]
                    }
                },
                "displaySettings": {
                    "display_device": { "value": "sRGB", "type": "ENUM", "name": "Display Device" }
                }
            }
        ],
        "missingFiles": [],
        "cyclesDevices": [
            {
                "id": "CUDA_NVIDIA_GeForce_RTX_4090",
                "name": "NVIDIA GeForce RTX 4090",
                "type": "CUDA",
                "use": true
            }
        ],
        "engineItems": [
            { "identifier": "CYCLES", "name": "Cycles" },
            { "identifier": "BLENDER_EEVEE_NEXT", "name": "EEVEE" }
        ],
        "formatItems": [
            { "identifier": "PNG", "name": "PNG" },
            { "identifier": "OPEN_EXR", "name": "OpenEXR" }
        ],
        "codecItems": [],
        "viewTransformItems": [
            { "identifier": "Standard", "name": "Standard" },
            { "identifier": "AgX", "name": "AgX" }
        ],
        "lookItems": [{ "identifier": "None", "name": "None" }],
        "deviceItems": [
            { "identifier": "CPU", "name": "CPU" },
            { "identifier": "GPU", "name": "GPU Compute" }
        ]
    })
}

pub fn create_missing_assets_inspect_output(blend_path: &str) -> Value {
    let mut base = create_default_inspect_output(blend_path);
    base["missingFiles"] = json!([
        {
            "path": "/textures/wood_diffuse_4k.png",
            "type": "image",
            "datablock": "Material_Wood",
            "relevance": "used"
        },
        {
            "path": "/fonts/title_font.ttf",
            "type": "font",
            "datablock": "Text_Title",
            "relevance": "used"
        },
        {
            "path": "/textures/scratch_spec.png",
            "type": "image",
            "datablock": "Material_Old",
            "relevance": "unused"
        },
        {
            "path": "/libraries/unused_asset.blend",
            "type": "library",
            "datablock": "Armature_Unused",
            "relevance": "unused"
        }
    ]);
    base
}
