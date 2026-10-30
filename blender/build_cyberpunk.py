"""Build CyberpunkBuildings.blend: the three buildings as Geometry Nodes.

Run (from the project root):
  "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background --factory-startup \
      --python blender/build_cyberpunk.py -- [--render] [--samples 32]

Writes blender/CyberpunkBuildings.blend, and with --render one EEVEE still
per building into docs/blender/. Safe to exec() in a live session too.
"""
import math
import os
import random
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
for m in ("cp_lib", "cp_kit", "cp_nodes"):
    sys.modules.pop(m, None)
import cp_kit  # noqa: E402
import cp_nodes  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
RENDER = "--render" in ARGS
SAMPLES = int(ARGS[ARGS.index("--samples") + 1]) if "--samples" in ARGS else 32
ONLY = ARGS[ARGS.index("--only") + 1] if "--only" in ARGS else None
OUT = os.path.normpath(os.path.join(HERE, "..", "docs", "blender"))

SPACING = 52.0
LAYOUT = {"hive": -SPACING, "arcology": 0.0, "capsule": SPACING}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def load_font():
    for path in ("C:/Windows/Fonts/YuGothB.ttc", "C:/Windows/Fonts/msgothic.ttc", "C:/Windows/Fonts/meiryob.ttc"):
        if os.path.exists(path):
            try:
                return bpy.data.fonts.load(path, check_existing=True)
            except RuntimeError:
                continue
    return None


def add_building(name, ng, x, values, col):
    me = bpy.data.meshes.new(name)
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    ob.location = (x, 0, 0)
    mod = ob.modifiers.new("Cyberpunk", "NODES")
    mod.node_group = ng
    for item in ng.interface.items_tree:
        if item.item_type == "SOCKET" and item.in_out == "INPUT" and item.name in values:
            mod[item.identifier] = values[item.name]
    return ob


def ground(M, col):
    bpy.ops.mesh.primitive_plane_add(size=900, location=(0, 0, 0))
    g = bpy.context.active_object
    g.name = "CP_Street"
    g.data.materials.append(M["asphalt"])
    for c in g.users_collection:
        c.objects.unlink(g)
    col.objects.link(g)
    # sidewalks under each building
    for name, x in LAYOUT.items():
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, 0.08))
        s = bpy.context.active_object
        s.name = f"CP_Sidewalk_{name}"
        s.scale = (44 if name == "arcology" else 32, 36 if name == "arcology" else 26, 0.16)
        s.data.materials.append(M["slab"])
        for c in s.users_collection:
            c.objects.unlink(s)
        col.objects.link(s)


def world_and_render(scene):
    w = bpy.data.worlds.new("CP_NightSmog")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
    sky = nt.nodes.new("ShaderNodeTexGradient")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.5
    ramp.color_ramp.elements[0].color = (0.09, 0.02, 0.08, 1)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.004, 0.005, 0.012, 1)
    nt.links.new(sep.outputs[2], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0
    del sky
    # thin smog volume
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Density"].default_value = 0.0035
    vol.inputs["Color"].default_value = (0.55, 0.45, 0.75, 1)
    vol.inputs["Anisotropy"].default_value = 0.35
    out = next(n for n in nt.nodes if n.type == "OUTPUT_WORLD")
    nt.links.new(vol.outputs[0], out.inputs["Volume"])

    r = scene.render
    r.resolution_x, r.resolution_y = 1920, 1080
    r.resolution_percentage = 100
    try:
        r.engine = "BLENDER_EEVEE"
    except TypeError:
        pass
    ee = scene.eevee
    for attr, val in (("taa_render_samples", SAMPLES), ("use_raytracing", True), ("use_shadows", True),
                      ("volumetric_end", 600.0), ("volumetric_tile_size", "4"), ("use_volumetric_shadows", True)):
        try:
            setattr(ee, attr, val)
        except (AttributeError, TypeError):
            pass
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Punchy"
    except TypeError:
        pass
    scene.view_settings.exposure = 0.3


def compositor_bloom(scene):
    try:
        tree = bpy.data.node_groups.new("CP_Compositor", "CompositorNodeTree")
        scene.compositing_node_group = tree
        tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        rl = tree.nodes.new("CompositorNodeRLayers")
        glare = tree.nodes.new("CompositorNodeGlare")
        out = tree.nodes.new("NodeGroupOutput")
        try:
            glare.inputs["Type"].default_value = "Bloom"
        except Exception:
            try:
                glare.glare_type = "BLOOM"
            except Exception:
                pass
        for name, val in (("Threshold", 1.6), ("Strength", 0.35), ("Size", 0.6)):
            if name in glare.inputs:
                try:
                    glare.inputs[name].default_value = val
                except Exception:
                    pass
        tree.links.new(rl.outputs["Image"], glare.inputs["Image"])
        tree.links.new(glare.outputs["Image"], out.inputs["Image"])
        return "bloom ok"
    except Exception as e:  # compositor API differs between versions
        return f"bloom skipped: {e}"


def lights(col):
    def add(name, ltype, loc, color, energy, size=1.0, rot=None):
        ld = bpy.data.lights.new(name, ltype)
        ld.color = color
        ld.energy = energy
        if hasattr(ld, "shadow_soft_size"):
            ld.shadow_soft_size = size
        ob = bpy.data.objects.new(name, ld)
        ob.location = loc
        if rot:
            ob.rotation_euler = rot
        col.objects.link(ob)
        return ob
    add("CP_Moon", "SUN", (0, 0, 100), (0.62, 0.7, 1.0), 0.8, rot=(math.radians(52), 0, math.radians(-38)))
    for name, x in LAYOUT.items():
        add(f"CP_PinkFill_{name}", "POINT", (x + 14, -24, 6), (1.0, 0.2, 0.55), 5000, 3)
        add(f"CP_CyanFill_{name}", "POINT", (x - 16, -20, 10), (0.1, 0.8, 1.0), 4500, 3)
        add(f"CP_Street_{name}", "AREA", (x, -16, 9), (1.0, 0.75, 0.55), 6000, 8, rot=(math.radians(30), 0, 0))


def cameras(col, scene):
    cams = {}
    shots = {
        "hive": ((LAYOUT["hive"] + 42, -80, 3), (LAYOUT["hive"] - 1, 0, 24), 58),
        "arcology": ((LAYOUT["arcology"] + 135, -300, 24), (LAYOUT["arcology"], 0, 98), 56),
        "capsule": ((LAYOUT["capsule"] + 40, -78, 3), (LAYOUT["capsule"], 0, 24), 58),
        "lineup": ((0, -290, 10), (0, 0, 78), 62),
    }
    for name, (loc, tgt, lens_deg) in shots.items():
        cd = bpy.data.cameras.new(f"CP_Cam_{name}")
        cd.angle = math.radians(lens_deg)
        cd.clip_end = 2000
        ob = bpy.data.objects.new(f"CP_Cam_{name}", cd)
        ob.location = loc
        col.objects.link(ob)
        empty = bpy.data.objects.new(f"CP_CamTarget_{name}", None)
        empty.location = tgt
        col.objects.link(empty)
        c = ob.constraints.new("TRACK_TO")
        c.target = empty
        c.track_axis = "TRACK_NEGATIVE_Z"
        c.up_axis = "UP_Y"
        cams[name] = ob
    scene.camera = cams["lineup"]
    return cams


def frame_viewports():
    """open the file looking at all three buildings, in material preview"""
    from mathutils import Euler
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type != "VIEW_3D":
                continue
            for sp in area.spaces:
                if sp.type != "VIEW_3D":
                    continue
                sp.clip_end = 3000
                sp.shading.type = "MATERIAL"
                r3d = sp.region_3d
                r3d.view_perspective = "PERSP"
                r3d.view_location = (0, 0, 45)
                r3d.view_rotation = Euler((math.radians(82), 0, math.radians(10))).to_quaternion()
                r3d.view_distance = 230


def main():
    reset()
    scene = bpy.context.scene
    root = scene.collection
    M = cp_kit.build_materials()
    K, C = cp_kit.build_kit(M, root)
    font = load_font()
    NG = cp_nodes.build_all(M, K, C, font)

    bcol = bpy.data.collections.new("CP_Buildings")
    root.children.link(bcol)
    add_building("HIVE", NG["hive"], LAYOUT["hive"], {"Floors": 13, "Bays X": 6, "Bays Y": 4, "Seed": 7}, bcol)
    add_building("ARCOLOGY", NG["arcology"], LAYOUT["arcology"], {"Floors": 32, "Seed": 3}, bcol)
    add_building("CAPSULE", NG["capsule"], LAYOUT["capsule"], {"Pod Floors": 14, "Seed": 11}, bcol)

    scol = bpy.data.collections.new("CP_Stage")
    root.children.link(scol)
    ground(M, scol)
    lights(scol)
    cams = cameras(scol, scene)
    world_and_render(scene)
    print("[cp]", compositor_bloom(scene))
    frame_viewports()

    blend = os.path.join(HERE, "CyberpunkBuildings.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    print("[cp] saved", blend)

    # report evaluated sizes
    dg = bpy.context.evaluated_depsgraph_get()
    for name in ("HIVE", "ARCOLOGY", "CAPSULE"):
        ob = bpy.data.objects[name].evaluated_get(dg)
        n_inst = sum(1 for i in dg.object_instances if i.is_instance and i.parent and i.parent.name == name)
        print(f"[cp] {name}: dims {tuple(round(d, 1) for d in ob.dimensions)} instances {n_inst}")

    if RENDER:
        os.makedirs(OUT, exist_ok=True)
        for name, cam in cams.items():
            if ONLY and ONLY != name:
                continue
            scene.camera = cam
            scene.render.filepath = os.path.join(OUT, f"blender_{name}.png")
            bpy.ops.render.render(write_still=True)
            print("[cp] rendered", scene.render.filepath)
        scene.camera = cams["lineup"]
        bpy.ops.wm.save_as_mainfile(filepath=blend)


main()
