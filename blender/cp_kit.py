"""Materials and the module kit for the cyberpunk buildings (Blender 5.1).

Kit pieces are modelled once with bmesh. Their convention: the wall is the
XZ plane at y = 0, +Y points out of the wall towards the street, Z is up.
Geometry Nodes decides where every piece goes.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

NEON = [(1.0, 0.16, 0.43), (0.02, 0.85, 0.91), (1.0, 0.43, 0.78), (1.0, 0.82, 0.25), (0.48, 0.38, 1.0), (1.0, 0.62, 0.24)]
ROOMS = [(1.0, 0.6, 0.3), (0.78, 0.92, 1.0), (1.0, 0.25, 0.75), (0.2, 0.85, 1.0), (0.55, 0.35, 1.0), (1.0, 0.82, 0.55)]
TILES = [(0.36, 0.45, 0.44), (0.52, 0.48, 0.4), (0.46, 0.36, 0.38), (0.3, 0.35, 0.44), (0.62, 0.6, 0.55), (0.42, 0.4, 0.36)]


# ---------------------------------------------------------------- shader helpers

def _new_mat(name):
    m = bpy.data.materials.get(name)
    if m:
        bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m


def _bsdf(m):
    return next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def _ramp(nt, colors, constant=True):
    r = nt.nodes.new("ShaderNodeValToRGB")
    cr = r.color_ramp
    cr.interpolation = "CONSTANT" if constant else "LINEAR"
    while len(cr.elements) < len(colors):
        cr.elements.new(0.5)
    for i, c in enumerate(colors):
        cr.elements[i].position = i / len(colors)
        cr.elements[i].color = (*c, 1.0)
    return r


def _inst_random(nt):
    oi = nt.nodes.new("ShaderNodeObjectInfo")
    return oi.outputs["Random"]


def _wall_coords(nt):
    """(x + y, z) so 2D textures wrap around vertical walls in any direction"""
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], sep.inputs[0])
    add = nt.nodes.new("ShaderNodeMath")
    add.operation = "ADD"
    nt.links.new(sep.outputs[0], add.inputs[0])
    nt.links.new(sep.outputs[1], add.inputs[1])
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(add.outputs[0], comb.inputs[0])
    nt.links.new(sep.outputs[2], comb.inputs[1])
    return comb.outputs[0], geo.outputs["Position"]


def basic(name, color, rough=0.6, metal=0.0, noise=0.25, bump=0.15):
    m = _new_mat(name)
    nt = m.node_tree
    b = _bsdf(m)
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if noise > 0:
        tex = nt.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = 3.0
        tex.inputs["Detail"].default_value = 8.0
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = noise
        mix.inputs["A"].default_value = (*color, 1)
        nt.links.new(tex.outputs["Fac"], mix.inputs["B"])
        nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
        bp = nt.nodes.new("ShaderNodeBump")
        bp.inputs["Strength"].default_value = bump
        nt.links.new(tex.outputs["Fac"], bp.inputs["Height"])
        nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m


def emissive(name, color, strength):
    m = _new_mat(name)
    b = _bsdf(m)
    b.inputs["Base Color"].default_value = (0.02, 0.02, 0.02, 1)
    b.inputs["Emission Color"].default_value = (*color, 1)
    b.inputs["Emission Strength"].default_value = strength
    return m


def tile_mat():
    """facade tiles: colour per instance (Object Info Random), mosaic grid, grime"""
    m = _new_mat("CP_Tile")
    nt = m.node_tree
    b = _bsdf(m)
    uv, pos = _wall_coords(nt)
    ramp = _ramp(nt, TILES)
    nt.links.new(_inst_random(nt), ramp.inputs[0])
    brick = nt.nodes.new("ShaderNodeTexBrick")
    brick.inputs["Scale"].default_value = 9.0
    brick.inputs["Mortar Size"].default_value = 0.012
    brick.offset = 0.0
    brick.squash = 1.0
    nt.links.new(uv, brick.inputs["Vector"])
    nt.links.new(ramp.outputs["Color"], brick.inputs["Color1"])
    nt.links.new(ramp.outputs["Color"], brick.inputs["Color2"])
    brick.inputs["Mortar"].default_value = (0.08, 0.08, 0.08, 1)
    # vertical grime streaks
    streak = nt.nodes.new("ShaderNodeTexNoise")
    streak.inputs["Scale"].default_value = 2.0
    streak.inputs["Detail"].default_value = 6
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (4.0, 0.25, 1.0)
    nt.links.new(uv, mapping.inputs["Vector"])
    nt.links.new(mapping.outputs[0], streak.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 0.7
    nt.links.new(brick.outputs["Color"], mix.inputs["A"])
    nt.links.new(streak.outputs["Fac"], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.45
    bp = nt.nodes.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.25
    nt.links.new(brick.outputs["Fac"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m


def window_mat():
    """glass with a lit room: per-instance lit / colour / blinds"""
    m = _new_mat("CP_Window")
    nt = m.node_tree
    b = _bsdf(m)
    b.inputs["Base Color"].default_value = (0.01, 0.012, 0.015, 1)
    b.inputs["Roughness"].default_value = 0.05
    b.inputs["Metallic"].default_value = 0.2
    rnd = _inst_random(nt)
    lit = nt.nodes.new("ShaderNodeMath")
    lit.operation = "LESS_THAN"
    lit.inputs[1].default_value = 0.55
    nt.links.new(rnd, lit.inputs[0])
    frac = nt.nodes.new("ShaderNodeMath")
    frac.operation = "FRACT"
    mul7 = nt.nodes.new("ShaderNodeMath")
    mul7.operation = "MULTIPLY"
    mul7.inputs[1].default_value = 7.31
    nt.links.new(rnd, mul7.inputs[0])
    nt.links.new(mul7.outputs[0], frac.inputs[0])
    ramp = _ramp(nt, ROOMS)
    nt.links.new(frac.outputs[0], ramp.inputs[0])
    # blinds: horizontal slats in object space
    tc = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "Z"
    wave.inputs["Scale"].default_value = 9.0
    nt.links.new(tc.outputs["Object"], wave.inputs["Vector"])
    slat = nt.nodes.new("ShaderNodeMapRange")
    slat.inputs["To Min"].default_value = 0.55
    nt.links.new(wave.outputs["Fac"], slat.inputs["Value"])
    strength = nt.nodes.new("ShaderNodeMath")
    strength.operation = "MULTIPLY"
    nt.links.new(lit.outputs[0], strength.inputs[0])
    nt.links.new(slat.outputs[0], strength.inputs[1])
    s2 = nt.nodes.new("ShaderNodeMath")
    s2.operation = "MULTIPLY"
    s2.inputs[1].default_value = 3.5
    nt.links.new(strength.outputs[0], s2.inputs[0])
    nt.links.new(ramp.outputs["Color"], b.inputs["Emission Color"])
    nt.links.new(s2.outputs[0], b.inputs["Emission Strength"])
    return m


def neon_mat(name="CP_Neon", strength=14.0, colors=NEON):
    """emission; colour from the instance random, so each sign/ring differs"""
    m = _new_mat(name)
    nt = m.node_tree
    b = _bsdf(m)
    b.inputs["Base Color"].default_value = (0.02, 0.02, 0.02, 1)
    ramp = _ramp(nt, colors)
    nt.links.new(_inst_random(nt), ramp.inputs[0])
    nt.links.new(ramp.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = strength
    return m


def pod_mat():
    m = _new_mat("CP_Pod")
    nt = m.node_tree
    b = _bsdf(m)
    uv, _ = _wall_coords(nt)
    brick = nt.nodes.new("ShaderNodeTexBrick")
    brick.inputs["Scale"].default_value = 1.2
    brick.inputs["Mortar Size"].default_value = 0.006
    brick.inputs["Color1"].default_value = (0.66, 0.64, 0.6, 1)
    brick.inputs["Color2"].default_value = (0.6, 0.59, 0.56, 1)
    brick.inputs["Mortar"].default_value = (0.05, 0.05, 0.05, 1)
    nt.links.new(uv, brick.inputs["Vector"])
    nt.links.new(brick.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.35
    b.inputs["Metallic"].default_value = 0.3
    bp = nt.nodes.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.3
    nt.links.new(brick.outputs["Fac"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m


def curtain_mat(name="CP_CurtainWall", lit_frac=0.5, strength=2.6):
    """curtain wall: procedural window grid (frames + glass) with random lit offices"""
    m = _new_mat(name)
    nt = m.node_tree
    b = _bsdf(m)
    uv, _ = _wall_coords(nt)
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1 / 1.6, 1 / 3.8, 1)
    nt.links.new(uv, mapping.inputs["Vector"])
    cell = nt.nodes.new("ShaderNodeVectorMath")
    cell.operation = "FLOOR"
    nt.links.new(mapping.outputs[0], cell.inputs[0])
    fr = nt.nodes.new("ShaderNodeVectorMath")
    fr.operation = "FRACTION"
    nt.links.new(mapping.outputs[0], fr.inputs[0])
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(fr.outputs[0], sep.inputs[0])

    def band(sock, lo, hi):
        a = nt.nodes.new("ShaderNodeMath"); a.operation = "GREATER_THAN"; a.inputs[1].default_value = lo
        bb = nt.nodes.new("ShaderNodeMath"); bb.operation = "LESS_THAN"; bb.inputs[1].default_value = hi
        nt.links.new(sock, a.inputs[0]); nt.links.new(sock, bb.inputs[0])
        mm = nt.nodes.new("ShaderNodeMath"); mm.operation = "MULTIPLY"
        nt.links.new(a.outputs[0], mm.inputs[0]); nt.links.new(bb.outputs[0], mm.inputs[1])
        return mm.outputs[0]
    mx = band(sep.outputs[0], 0.08, 0.92)
    my = band(sep.outputs[1], 0.14, 0.86)
    mask = nt.nodes.new("ShaderNodeMath"); mask.operation = "MULTIPLY"
    nt.links.new(mx, mask.inputs[0]); nt.links.new(my, mask.inputs[1])
    wn = nt.nodes.new("ShaderNodeTexWhiteNoise")
    wn.noise_dimensions = "3D"
    nt.links.new(cell.outputs[0], wn.inputs["Vector"])
    lit = nt.nodes.new("ShaderNodeMath")
    lit.operation = "LESS_THAN"
    lit.inputs[1].default_value = lit_frac
    nt.links.new(wn.outputs["Value"], lit.inputs[0])
    ramp = _ramp(nt, [(0.75, 0.88, 1.0), (1.0, 0.8, 0.55), (0.3, 0.8, 1.0), (1.0, 0.65, 0.4)])
    nt.links.new(wn.outputs["Color"], ramp.inputs[0])
    st = nt.nodes.new("ShaderNodeMath"); st.operation = "MULTIPLY"
    nt.links.new(lit.outputs[0], st.inputs[0]); nt.links.new(mask.outputs[0], st.inputs[1])
    st2 = nt.nodes.new("ShaderNodeMath"); st2.operation = "MULTIPLY"; st2.inputs[1].default_value = strength
    nt.links.new(st.outputs[0], st2.inputs[0])
    nt.links.new(ramp.outputs["Color"], b.inputs["Emission Color"])
    nt.links.new(st2.outputs[0], b.inputs["Emission Strength"])
    base = nt.nodes.new("ShaderNodeMix"); base.data_type = "RGBA"
    base.inputs["A"].default_value = (0.05, 0.05, 0.055, 1)
    base.inputs["B"].default_value = (0.008, 0.01, 0.014, 1)
    nt.links.new(mask.outputs[0], base.inputs["Factor"])
    nt.links.new(base.outputs["Result"], b.inputs["Base Color"])
    rough = nt.nodes.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = 0.5
    rough.inputs["To Max"].default_value = 0.05
    nt.links.new(mask.outputs[0], rough.inputs["Value"])
    nt.links.new(rough.outputs[0], b.inputs["Roughness"])
    b.inputs["Metallic"].default_value = 0.6
    return m


def screen_mat():
    """big ad screen: bands of saturated colour with a scrolling wave"""
    m = _new_mat("CP_Screen")
    nt = m.node_tree
    b = _bsdf(m)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 1.4
    wave.inputs["Distortion"].default_value = 6
    nt.links.new(tc.outputs["Generated"], wave.inputs["Vector"])
    ramp = _ramp(nt, [(1.0, 0.1, 0.5), (0.1, 0.05, 0.4), (0.0, 0.9, 1.0), (1.0, 0.75, 0.2)], constant=False)
    nt.links.new(wave.outputs["Fac"], ramp.inputs[0])
    nt.links.new(ramp.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 1.8
    b.inputs["Base Color"].default_value = (0, 0, 0, 1)
    return m


def asphalt_mat():
    m = _new_mat("CP_Asphalt")
    nt = m.node_tree
    b = _bsdf(m)
    b.inputs["Base Color"].default_value = (0.02, 0.02, 0.022, 1)
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.08
    noise.inputs["Detail"].default_value = 6
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.48
    ramp.inputs["From Max"].default_value = 0.56
    ramp.inputs["To Min"].default_value = 0.35
    ramp.inputs["To Max"].default_value = 0.02
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Value"])
    nt.links.new(ramp.outputs[0], b.inputs["Roughness"])
    return m


def build_materials():
    M = {}
    M["concrete"] = basic("CP_Concrete", (0.12, 0.12, 0.125), 0.85, 0, 0.5, 0.3)
    M["concreteLight"] = basic("CP_ConcreteLight", (0.3, 0.29, 0.27), 0.8, 0, 0.4, 0.3)
    M["slab"] = basic("CP_Slab", (0.18, 0.17, 0.16), 0.9, 0, 0.5, 0.2)
    M["metal"] = basic("CP_Metal", (0.08, 0.085, 0.095), 0.4, 0.8, 0.2, 0.05)
    M["metalBare"] = basic("CP_MetalBare", (0.45, 0.46, 0.48), 0.3, 1.0, 0.2, 0.05)
    M["frame"] = basic("CP_Frame", (0.03, 0.03, 0.035), 0.35, 0.8, 0.0)
    M["acUnit"] = basic("CP_ACUnit", (0.5, 0.48, 0.44), 0.5, 0.1, 0.35, 0.1)
    M["grille"] = basic("CP_Grille", (0.01, 0.01, 0.012), 0.6, 0.5, 0.0)
    M["rust"] = basic("CP_Rust", (0.22, 0.12, 0.07), 0.85, 0.3, 0.5, 0.3)
    M["shutter"] = basic("CP_Shutter", (0.3, 0.31, 0.33), 0.45, 0.8, 0.3, 0.1)
    M["awning"] = basic("CP_Awning", (0.35, 0.03, 0.05), 0.8, 0, 0.3, 0.1)
    M["tile"] = tile_mat()
    M["window"] = window_mat()
    M["neon"] = neon_mat()
    M["lightbox"] = neon_mat("CP_Lightbox", 3.0, [(1, 0.95, 0.85), (1, 0.85, 0.3), (1, 0.25, 0.25), (0.85, 0.95, 1)])
    M["lantern"] = emissive("CP_Lantern", (1.0, 0.25, 0.08), 8)
    M["beacon"] = emissive("CP_Beacon", (1.0, 0.05, 0.05), 25)
    M["warm"] = emissive("CP_WarmLight", (1.0, 0.85, 0.65), 12)
    M["pod"] = pod_mat()
    M["curtain"] = curtain_mat()
    M["city"] = curtain_mat("CP_CityTower", 0.2, 1.3)
    M["screen"] = screen_mat()
    M["asphalt"] = asphalt_mat()
    M["glass"] = basic("CP_Glass", (0.02, 0.025, 0.03), 0.05, 0.9, 0.0)
    return M


# ---------------------------------------------------------------- bmesh helpers

def _box(bm, c, s, mi=0):
    r = bmesh.ops.create_cube(bm, size=1.0)
    for v in r["verts"]:
        v.co = Vector((c[0] + v.co.x * s[0], c[1] + v.co.y * s[1], c[2] + v.co.z * s[2]))
    for f in {f for v in r["verts"] for f in v.link_faces}:
        f.material_index = mi


def _cyl(bm, c, r, depth, seg=16, axis="Z", mi=0, r2=None):
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    rot = Matrix.Identity(3)
    if axis == "Y":
        rot = Matrix.Rotation(math.pi / 2, 3, "X")
    elif axis == "X":
        rot = Matrix.Rotation(math.pi / 2, 3, "Y")
    for v in res["verts"]:
        v.co = rot @ v.co + Vector(c)
    for f in {f for v in res["verts"] for f in v.link_faces}:
        f.material_index = mi


def _bar(bm, a, b, r, mi=0, seg=6):
    a, b = Vector(a), Vector(b)
    d = b - a
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=d.length)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    mid = (a + b) / 2
    for v in res["verts"]:
        v.co = q @ v.co + mid
    for f in {f for v in res["verts"] for f in v.link_faces}:
        f.material_index = mi


def _obj(name, build, mats, col):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    build(bm)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    return ob


# ---------------------------------------------------------------- kit

def build_kit(M, root):
    kit = bpy.data.collections.new("CP_Kit")
    root.children.link(kit)
    wins = bpy.data.collections.new("CP_KitWindows")
    shops = bpy.data.collections.new("CP_KitShops")
    roofk = bpy.data.collections.new("CP_KitRoof")
    for c in (wins, shops, roofk):
        kit.children.link(c)
    K = {}

    def ac(bm):
        _box(bm, (0, 0.21, 0.28), (0.82, 0.3, 0.56), 0)
        _cyl(bm, (-0.12, 0.365, 0.28), 0.22, 0.02, 20, "Y", 1)
        _cyl(bm, (-0.12, 0.372, 0.28), 0.05, 0.03, 10, "Y", 0)
        for i in range(8):
            _box(bm, (0.26, 0.365, 0.08 + i * 0.055), (0.22, 0.01, 0.012), 1)
        for x in (-0.28, 0.28):
            _box(bm, (x, 0.2, -0.02), (0.04, 0.42, 0.04), 2)
            _bar(bm, (x, 0.02, -0.32), (x, 0.38, -0.02), 0.012, 2)
        _bar(bm, (-0.36, 0.25, 0.0), (-0.36, 0.2, -0.9), 0.012, 3)
    K["ac"] = _obj("KIT_ACUnit", ac, [M["acUnit"], M["grille"], M["metal"], M["acUnit"]], kit)

    def window(w, h, cols, rows=1):
        def build(bm):
            _box(bm, (0, 0.012, 0), (w, 0.01, h), 1)
            t, d = 0.06, 0.1
            _box(bm, (0, d / 2, h / 2 + t / 2), (w + 2 * t, d, t), 0)
            _box(bm, (0, d / 2, -h / 2 - t / 2), (w + 2 * t, d, t), 0)
            _box(bm, (-w / 2 - t / 2, d / 2, 0), (t, d, h), 0)
            _box(bm, (w / 2 + t / 2, d / 2, 0), (t, d, h), 0)
            for i in range(1, cols):
                _box(bm, (-w / 2 + w * i / cols, 0.035, 0), (0.035, 0.05, h), 0)
            for i in range(1, rows):
                _box(bm, (0, 0.035, -h / 2 + h * i / rows), (w, 0.05, 0.035), 0)
            _box(bm, (0, 0.08, -h / 2 - t - 0.03), (w + 0.24, 0.16, 0.06), 2)
        return build
    K["win_a"] = _obj("KIT_WinA_Slide", window(1.8, 1.3, 2), [M["frame"], M["window"], M["concreteLight"]], wins)
    K["win_b"] = _obj("KIT_WinB_Grid", window(1.5, 1.2, 3, 2), [M["metalBare"], M["window"], M["concreteLight"]], wins)
    K["win_c"] = _obj("KIT_WinC_Wide", window(2.5, 1.55, 4), [M["metalBare"], M["window"], M["concreteLight"]], wins)

    def cage(bm):
        w, h, d = 2.0, 1.5, 0.42
        for z in (-h / 2, h / 2):
            _box(bm, (0, d, z), (w, 0.03, 0.03), 0)
            for x in (-w / 2, w / 2):
                _box(bm, (x, d / 2, z), (0.025, d, 0.025), 0)
        for x in (-w / 2, w / 2):
            _box(bm, (x, d, 0), (0.03, 0.03, h), 0)
        n = 16
        for i in range(1, n):
            _box(bm, (-w / 2 + w * i / n, d, 0), (0.014, 0.014, h), 0)
        _box(bm, (0, d / 2, -h / 2), (w, d, 0.02), 0)
        _box(bm, (0.5, d * 0.5, -h / 2 + 0.12), (0.2, 0.2, 0.2), 1)
    K["cage"] = _obj("KIT_Cage", cage, [M["rust"], M["concreteLight"]], kit)

    def shop_open(bm):
        _box(bm, (0, 0.03, 1.65), (2.6, 0.02, 3.2), 1)
        for x in (-1.3, -0.45, 0.45, 1.3):
            _box(bm, (x, 0.06, 1.65), (0.06, 0.08, 3.3), 0)
        _box(bm, (0, 0.06, 3.28), (2.7, 0.08, 0.08), 0)
        # awning
        _box(bm, (0, 0.75, 3.55), (2.7, 1.5, 0.03), 2)
        _box(bm, (0, 1.5, 3.4), (2.7, 0.03, 0.3), 2)
        # sign lightbox
        _box(bm, (0, 0.25, 4.0), (2.2, 0.2, 0.6), 3)
    K["shop_a"] = _obj("KIT_ShopA_Open", shop_open, [M["frame"], M["window"], M["awning"], M["lightbox"]], shops)

    def shop_shut(bm):
        for i in range(36):
            _box(bm, (0, 0.05, 0.1 + i * 0.09), (2.6, 0.03, 0.07), 0)
        _box(bm, (0, 0.15, 3.45), (2.75, 0.32, 0.32), 1)
        _box(bm, (0, 0.25, 4.0), (2.2, 0.2, 0.6), 2)
    K["shop_b"] = _obj("KIT_ShopB_Shutter", shop_shut, [M["shutter"], M["metal"], M["lightbox"]], shops)

    def tank(bm):
        for i in range(4):
            a = i * math.pi / 2 + math.pi / 4
            _box(bm, (math.cos(a) * 0.7, math.sin(a) * 0.7, 0.6), (0.1, 0.1, 1.2), 1)
        _box(bm, (0, 0, 1.22), (1.6, 1.6, 0.08), 1)
        _cyl(bm, (0, 0, 2.1), 0.95, 1.7, 24, "Z", 0)
        _cyl(bm, (0, 0, 3.0), 0.8, 0.12, 24, "Z", 0)
        for z in (1.6, 2.1, 2.6):
            _cyl(bm, (0, 0, z), 0.97, 0.05, 24, "Z", 1)
    K["tank"] = _obj("KIT_WaterTank", tank, [M["metalBare"], M["metal"]], roofk)

    def antenna(bm):
        _cyl(bm, (0, 0, 3.0), 0.03, 6.0, 6, "Z", 0)
        for i, z in enumerate((4.2, 5.0, 5.7)):
            L = 1.6 - i * 0.3
            _box(bm, (0, 0, z), (L, 0.025, 0.025), 0)
            for k in range(-2, 3):
                _box(bm, (k * L * 0.22, 0, z), (0.015, L * 0.4, 0.015), 0)
        _cyl(bm, (0, 0, 6.05), 0.07, 0.07, 10, "Z", 1)
    K["antenna"] = _obj("KIT_Antenna", antenna, [M["metalBare"], M["beacon"]], roofk)

    def dish(bm):
        _cyl(bm, (0, 0, 0.45), 0.03, 0.9, 6, "Z", 1)
        res = bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=8, radius=0.6)
        for v in res["verts"]:
            v.co = Vector((v.co.x, min(v.co.y, 0.0) * 0.3 + 0.0, v.co.z))
            v.co = Matrix.Rotation(-0.5, 3, "X") @ v.co + Vector((0, 0.1, 1.0))
        for f in {f for v in res["verts"] for f in v.link_faces}:
            f.material_index = 0
        _bar(bm, (0, -0.1, 0.95), (0, 0.55, 1.35), 0.012, 1)
    K["dish"] = _obj("KIT_Dish", dish, [M["acUnit"], M["metal"]], roofk)

    def hvac(bm):
        _box(bm, (0, 0, 0.5), (1.6, 1.0, 1.0), 0)
        _cyl(bm, (0, 0, 1.02), 0.38, 0.04, 20, "Z", 1)
    K["hvac"] = _obj("KIT_HVAC", hvac, [M["acUnit"], M["grille"]], roofk)

    def pod(bm):
        _box(bm, (0, 2.0, 0), (2.36, 4.0, 2.4), 0)
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.18, segments=3, affect="EDGES")
        for zz in (0.9, 3.1):
            _box(bm, (0, zz, 0), (2.4, 0.06, 2.44), 1)
        _cyl(bm, (0, 4.02, 0.08), 0.6, 0.02, 32, "Y", 2)
        res = bmesh.ops.create_cone(bm, cap_ends=False, segments=32, radius1=0.68, radius2=0.68, depth=0.12)
        for v in res["verts"]:
            v.co = Matrix.Rotation(math.pi / 2, 3, "X") @ v.co + Vector((0, 4.05, 0.08))
        for f in {f for v in res["verts"] for f in v.link_faces}:
            f.material_index = 1
        # neon ring
        res = bmesh.ops.create_cone(bm, cap_ends=False, segments=40, radius1=0.84, radius2=0.84, depth=0.04)
        for v in res["verts"]:
            v.co = Matrix.Rotation(math.pi / 2, 3, "X") @ v.co + Vector((0, 4.06, 0.08))
        for f in {f for v in res["verts"] for f in v.link_faces}:
            f.material_index = 3
        # vent + plate + bolts
        for i in range(6):
            _box(bm, (1.19, 2.6, 0.2 + i * 0.07), (0.02, 0.7, 0.03), 1)
        _box(bm, (0.65, 4.02, -0.82), (0.42, 0.02, 0.16), 4)
        for x in (-0.8, 0.8):
            for z in (-0.8, 0.8):
                _box(bm, (x, -0.04, z), (0.3, 0.12, 0.3), 1)
    K["pod"] = _obj("KIT_Pod", pod, [M["pod"], M["frame"], M["window"], M["neon"], M["lightbox"]], kit)

    def stall(bm):
        _box(bm, (0, 0, 0.5), (2.4, 0.8, 1.0), 0)
        _box(bm, (0, 0, 1.02), (2.5, 0.9, 0.04), 1)
        for x in (-0.7, 0.0):
            _cyl(bm, (x, -0.1, 1.2), 0.22, 0.32, 16, "Z", 1)
        _box(bm, (0.8, 0, 1.06), (0.5, 0.4, 0.02), 3)
        for x in (-0.8, 0, 0.8):
            _cyl(bm, (x, 0.85, 0.33), 0.03, 0.66, 6, "Z", 2)
            _cyl(bm, (x, 0.85, 0.68), 0.18, 0.06, 12, "Z", 4)
        _box(bm, (0, 0.3, 2.6), (2.8, 1.4, 0.03), 4)
    K["stall"] = _obj("KIT_Stall", stall, [M["rust"], M["metalBare"], M["metal"], M["lantern"], M["awning"]], kit)

    def lantern(bm):
        res = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.15)
        for v in res["verts"]:
            v.co.z *= 1.3
        _cyl(bm, (0, 0, 0.22), 0.06, 0.04, 8, "Z", 1)
        _cyl(bm, (0, 0, -0.22), 0.06, 0.04, 8, "Z", 1)
    K["lantern"] = _obj("KIT_Lantern", lantern, [M["lantern"], M["metal"]], kit)

    kit.hide_render = True
    kit.hide_viewport = True
    return K, {"windows": wins, "shops": shops, "roof": roofk}
