"""Geometry Nodes trees for the three cyberpunk buildings (Blender 5.1).

CP_NeonText     String to Curves -> tubes (neon) + filled glyphs, facing +Y
CP_BladeSign    a vertical kanji blade sign: board + neon text on both faces
CP_HiveFacade   one facade of HIVE: cantilevered module stacks, windows,
                cages, AC units, pipes, shops, blade signs
CP_Hive         four facades + core + roof (tanks, antennas, dishes) + corner neon + billboard
CP_Arcology     podium + three chamfered setback segments + fins + LED corners +
                screens + crown rings + spire + corp name
CP_PodFace      capsule pods on one core face
CP_Capsule      night-market podium + one/two cores with pods + bridges + signs
"""
import math

import bpy

from cp_lib import G

PI = math.pi
FACE_PLUS_Y = (PI / 2, 0, PI)  # String to Curves (XY) -> standing up, readable from +Y


def neon_text(M, font):
    g = G("CP_NeonText", modifier=False)
    text = g.inp("String", "NodeSocketString", "NEON")
    size = g.inp("Size", "NodeSocketFloat", 1.0, 0.05, 20)
    tube = g.inp("Tube", "NodeSocketFloat", 0.03, 0.002, 1)
    spacing = g.inp("Line Spacing", "NodeSocketFloat", 1.0, 0.1, 3)
    g.out("Geometry")
    g.frame("Text -> neon tubes")
    curves = g.realize(g.string_curves(text, size, font, "CENTER", spacing))
    tubes = g.curve_to_mesh(curves, g.curve_circle(tube, 6))
    tubes = g.setmat(g.smooth(tubes), M["neon"])
    g.frame("Filled glyphs (dim backing)")
    fill = g.setmat(g.transform(g.fill_curve(curves), t=(0, 0, -0.02)), M["grille"])
    g.frame("Stand up, face +Y")
    out = g.transform(g.join(tubes, fill), r=FACE_PLUS_Y)
    g.output(out)
    return g.ng


def blade_sign(M, neon_ng):
    g = G("CP_BladeSign", modifier=False)
    text = g.inp("String", "NodeSocketString", "夜市")
    size = g.inp("Size", "NodeSocketFloat", 0.8, 0.1, 5)
    chars = g.inp("Chars", "NodeSocketInt", 2, 1, 8)
    g.out("Geometry")
    g.frame("Board sized to the text")
    h = g.add(g.mul(g.mul(chars, size), 1.12), 0.4)
    w = g.add(size, 0.35)
    cz = g.sub(g.mul(size, 0.4), g.mul(h, 0.5))
    board = g.transform(g.cube(g.vec(w, 0.22, h)), t=g.vec(0, 0, g.add(cz, 0.2)))
    board = g.setmat(board, M["frame"])
    frame_ = g.transform(g.cube(g.vec(g.add(w, 0.08), 0.18, g.add(h, 0.08))), t=g.vec(0, 0, g.add(cz, 0.2)))
    frame_ = g.setmat(frame_, M["metalBare"])
    g.frame("Neon text on both faces")
    front = g.group(neon_ng, String=text, Size=size, Tube=g.mul(size, 0.035), Line_Spacing=1.12).outputs[0]
    front = g.transform(front, t=(0, 0.13, 0))
    back = g.transform(front, r=(0, 0, PI))
    g.output(g.join(board, frame_, front, back))
    return g.ng


BLADE_WORDS = ["夜市", "電脳", "酒場", "九龍", "麻雀", "義体", "ホテル", "カラオケ"]


def hive_facade(M, K, C, blades_ng):
    g = G("CP_HiveFacade", modifier=False)
    L = g.inp("Length", "NodeSocketFloat", 18.0, 3, 60)
    bays = g.inp("Bays", "NodeSocketInt", 6, 1, 20)
    floors = g.inp("Floors", "NodeSocketInt", 12, 1, 40)
    seed = g.inp("Seed", "NodeSocketInt", 0)
    street = g.inp("Street", "NodeSocketBool", True)
    acd = g.inp("AC Density", "NodeSocketFloat", 0.7, 0, 1)
    sgd = g.inp("Sign Density", "NodeSocketFloat", 0.8, 0, 1)
    cant = g.inp("Cantilever", "NodeSocketFloat", 1.1, 0, 2)
    cage_d = g.inp("Cage Density", "NodeSocketFloat", 0.35, 0, 1)
    g.out("Geometry")
    GH, FH = 4.6, 2.95

    g.frame("Module points: one per bay per floor")
    bw = g.div(L, bays)
    sx = g.sub(L, bw)
    sy = g.mul(g.sub(floors, 1), FH)
    grid = g.grid(sx, sy, bays, floors)
    zc = g.add(GH + FH / 2, g.mul(sy, 0.5))
    pts = g.points(g.transform(grid, t=g.vec(g.mul(L, 0.5), 0, zc), r=(PI / 2, 0, 0)))
    px, py, pz = g.sep(g.pos())
    bay = g.math("FLOOR", g.div(px, bw))
    flo = g.math("FLOOR", g.div(g.sub(pz, GH), FH))

    g.frame("Cantilever depth: random per vertical run of 3 floors")
    run = g.add(g.mul(bay, 100), g.math("FLOOR", g.div(flo, 3)))
    step = g.math("FLOOR", g.rand_f(0, 3.999, g.math("ROUND", run), seed))
    depth = g.mul(g.div(step, 3), cant)
    depth_m = g.math("MAXIMUM", depth, 0.08)

    g.frame("Room modules (tile colour per instance)")
    mod_pts = g.setpos(pts, offset=g.vec(0, g.mul(depth_m, 0.5), 0))
    modules = g.inst(mod_pts, g.cube((1, 1, 1)), scale=g.vec(g.sub(bw, 0.12), depth_m, FH - 0.06))
    modules = g.setmat(g.realize(modules), M["tile"])
    under = g.inst(g.setpos(pts, offset=g.vec(0, g.mul(depth_m, 0.5), -FH / 2 + 0.06)), g.cube((1, 1, 1)),
                   scale=g.vec(g.sub(bw, 0.06), g.add(depth_m, 0.06), 0.12))
    under = g.setmat(g.realize(under), M["slab"])

    g.frame("Windows: three kit types, picked at random")
    wpos = g.setpos(pts, offset=g.vec(g.rand_f(-0.25, 0.25, None, g.add(seed, 1)), depth_m, 0.12))
    windows = g.inst(wpos, g.coll(C["windows"]), pick=True, idx=g.rand_i(0, 2, None, g.add(seed, 2)))
    cages = g.inst(wpos, g.obj(K["cage"]), sel=g.bool_op("AND", g.rand_b(cage_d, None, g.add(seed, 3)), g.compare("GREATER_THAN", flo, 0)))

    g.frame("AC units on brackets")
    side = g.switch("FLOAT", g.rand_b(0.5, None, g.add(seed, 5)), -0.95, 0.95)
    acp = g.setpos(pts, offset=g.vec(side, depth_m, g.rand_f(-1.2, 0.55, None, g.add(seed, 6))))
    acs = g.inst(acp, g.obj(K["ac"]), sel=g.rand_b(acd, None, g.add(seed, 4)), scale=g.rand_f(0.85, 1.05, None, g.add(seed, 7)))

    g.frame("Slab bands + pipes in the gaps")
    slabs = g.inst(g.points(g.line(floors, g.vec(g.mul(L, 0.5), 0.07, GH + FH), (0, 0, FH))), g.cube((1, 1, 1)),
                   scale=g.vec(L, 0.14, 0.14))
    slabs = g.setmat(g.realize(slabs), M["slab"])
    height = g.add(GH, g.mul(floors, FH))
    pipe_pts = g.points(g.line(g.add(bays, 1), g.vec(0, 0.12, g.mul(height, 0.5)), g.vec(bw, 0, 0)))
    pipes = g.inst(pipe_pts, g.cylinder(10, 0.06, 1.0), sel=g.rand_b(0.45, None, g.add(seed, 8)), scale=g.vec(1, 1, height))
    pipes = g.setmat(g.realize(pipes), M["metalBare"])

    g.frame("Ground floor: shopfronts (open / shutter)")
    shop_pts = g.points(g.line(bays, g.vec(g.mul(bw, 0.5), 0, 0), g.vec(bw, 0, 0)))
    shops = g.inst(shop_pts, g.coll(C["shops"]), pick=True, idx=g.rand_i(0, 1, None, g.add(seed, 9)))
    piers = g.inst(g.points(g.line(g.add(bays, 1), g.vec(0, 0.15, GH / 2), g.vec(bw, 0, 0))), g.cube((0.4, 0.3, GH)))
    piers = g.setmat(g.realize(piers), M["concrete"])
    fascia = g.setmat(g.transform(g.cube((1, 1, 1)), t=g.vec(g.mul(L, 0.5), 0.2, GH - 0.45), s=g.vec(L, 0.3, 0.9)), M["concrete"])

    g.frame("Blade signs over the street (street facades only)")
    blades = g.group(blades_ng).outputs[0]
    sign_pts = g.points(g.grid(L, 6.0, g.add(bays, 1), 2))
    sign_pts = g.transform(sign_pts, t=g.vec(g.mul(L, 0.5), 2.2, GH + 4.0), r=(PI / 2, 0, 0))
    sign_sel = g.bool_op("AND", street, g.rand_b(sgd, None, g.add(seed, 10)))
    blades_i = g.inst(sign_pts, blades, sel=sign_sel, pick=True, idx=g.rand_i(0, len(BLADE_WORDS) - 1, None, g.add(seed, 11)),
                      rot=(0, 0, PI / 2), scale=g.rand_f(0.85, 1.25, None, g.add(seed, 12)))
    arms = g.inst(sign_pts, g.cube((0.06, 2.2, 0.06)), sel=sign_sel)
    arms = g.setmat(g.realize(g.transform(arms, t=(0, -1.1, 0.3))), M["metal"])

    g.output(g.join(modules, under, windows, cages, acs, slabs, pipes, shops, piers, fascia, blades_i, arms))
    return g.ng


def hive(M, K, C, facade_ng, neon_ng):
    g = G("CP_Hive")
    floors = g.inp("Floors", "NodeSocketInt", 13, 4, 30)
    bx = g.inp("Bays X", "NodeSocketInt", 6, 2, 12)
    by = g.inp("Bays Y", "NodeSocketInt", 4, 2, 10)
    seed = g.inp("Seed", "NodeSocketInt", 7)
    acd = g.inp("AC Density", "NodeSocketFloat", 0.7, 0, 1)
    sgd = g.inp("Sign Density", "NodeSocketFloat", 0.8, 0, 1)
    cant = g.inp("Cantilever", "NodeSocketFloat", 1.1, 0, 2)
    cage_d = g.inp("Cage Density", "NodeSocketFloat", 0.35, 0, 1)
    word = g.inp("Corner Sign", "NodeSocketString", "H\nO\nT\nE\nL")
    g.out("Geometry")
    GH, FH, BW = 4.6, 2.95, 3.0
    W = g.mul(bx, BW)
    D = g.mul(by, BW)
    hW, hD = g.mul(W, 0.5), g.mul(D, 0.5)
    top = g.add(GH, g.mul(floors, FH))

    g.frame("Core volume")
    core = g.transform(g.cube((1, 1, 1)), t=g.vec(0, 0, g.mul(top, 0.5)), s=g.vec(g.sub(W, 0.1), g.sub(D, 0.1), top))
    core = g.setmat(core, M["concrete"])

    g.frame("Four facades (front and right are street sides)")
    sides = []
    specs = [  # (length, bays, translation, rotation z, street, seed offset)
        (W, bx, (hW, g.mul(hD, -1), 0), PI, True, 0),
        (D, by, (hW, hD, 0), -PI / 2, True, 101),
        (W, bx, (g.mul(hW, -1), hD, 0), 0.0, False, 202),
        (D, by, (g.mul(hW, -1), g.mul(hD, -1), 0), PI / 2, False, 303),
    ]
    for length, nb, t, rz, st, so in specs:
        f = g.group(facade_ng, Length=length, Bays=nb, Floors=floors, Seed=g.add(seed, so), Street=st,
                    AC_Density=acd, Sign_Density=sgd, Cantilever=cant, Cage_Density=cage_d).outputs[0]
        sides.append(g.transform(f, t=g.vec(*t), r=(0, 0, rz)))

    g.frame("Roof slab + parapet")
    roof = g.setmat(g.transform(g.cube((1, 1, 1)), t=g.vec(0, 0, g.add(top, 0.5)), s=g.vec(g.add(W, 0.2), g.add(D, 0.2), 1.0)), M["slab"])

    g.frame("Roof kit scattered on a grid: tanks, antennas, dishes, HVAC")
    rpts = g.points(g.grid(g.sub(W, 3), g.sub(D, 3), 5, 4))
    rpts = g.transform(rpts, t=g.vec(0, 0, g.add(top, 1.0)))
    rpts = g.setpos(rpts, offset=g.vec(g.rand_f(-0.8, 0.8, None, g.add(seed, 20)), g.rand_f(-0.8, 0.8, None, g.add(seed, 21)), 0))
    roofkit = g.inst(rpts, g.coll(C["roof"]), sel=g.rand_b(0.6, None, g.add(seed, 22)), pick=True,
                     idx=g.rand_i(0, 3, None, g.add(seed, 23)), rot=g.vec(0, 0, g.rand_f(0, 6.28, None, g.add(seed, 24))))

    g.frame("Corner neon tube sign (front-right corner, 45 degrees)")
    neon = g.group(neon_ng, String=word, Size=0.95, Tube=0.04, Line_Spacing=1.2).outputs[0]
    nh = g.add(GH, 13.0)
    neon = g.transform(neon, t=g.vec(0, 1.9, nh))
    board = g.setmat(g.transform(g.cube((1.3, 0.2, 6.6)), t=g.vec(0, 1.78, g.sub(nh, 2.6))), M["frame"])
    arm = g.setmat(g.transform(g.cube((0.12, 1.8, 6.4)), t=g.vec(0, 0.9, g.sub(nh, 2.6))), M["metal"])
    corner = g.transform(g.join(neon, board, arm), t=g.vec(hW, g.mul(hD, -1), 0), r=(0, 0, PI + PI / 4))

    g.frame("Rooftop billboard: scaffold + neon word")
    bb_text = g.group(neon_ng, String="SYNTH", Size=3.0, Tube=0.09).outputs[0]
    bb_z = g.add(top, 3.6)
    bb_text = g.transform(bb_text, t=g.vec(0, 0.15, bb_z))
    bb_board = g.setmat(g.transform(g.cube((12, 0.2, 4.4)), t=g.vec(0, 0, g.add(bb_z, 1.0))), M["frame"])
    legs = g.inst(g.points(g.line(7, g.vec(-6, -0.4, g.add(top, 2.4)), (2, 0, 0))), g.cube((0.12, 0.12, 4.8)))
    legs = g.setmat(g.realize(legs), M["metal"])
    billboard = g.transform(g.join(bb_text, bb_board, legs), t=g.vec(0, g.add(g.mul(hD, -1), 1.5), 0), r=(0, 0, PI))

    g.output(g.join(core, *sides, roof, roofkit, corner, billboard))
    return g.ng


def arcology(M, K, neon_ng):
    g = G("CP_Arcology")
    floors = g.inp("Floors", "NodeSocketInt", 40, 10, 90)
    width = g.inp("Width", "NodeSocketFloat", 25.0, 10, 50)
    depth = g.inp("Depth", "NodeSocketFloat", 18.0, 8, 40)
    setback = g.inp("Setback", "NodeSocketFloat", 0.82, 0.5, 1.0)
    seed = g.inp("Seed", "NodeSocketInt", 3)
    name = g.inp("Corp Name", "NodeSocketString", "KAIROS")
    g.out("Geometry")
    FH, PH = 3.8, 15.6

    g.frame("Podium")
    pod = g.setmat(g.transform(g.cube((1, 1, 1)), t=g.vec(0, 0, PH / 2), s=g.vec(g.add(width, 10), g.add(depth, 10), PH)), M["curtain"])
    pod_top = g.setmat(g.transform(g.cube((1, 1, 1)), t=g.vec(0, 0, PH + 0.4), s=g.vec(g.add(width, 10.4), g.add(depth, 10.4), 0.8)), M["metal"])
    canopy = g.setmat(g.transform(g.cube((16, 6, 0.35)), t=g.vec(0, g.sub(g.mul(depth, -0.5), 8.0), 7.0)), M["metal"])
    canopy_led = g.setmat(g.transform(g.cube((15.4, 5.4, 0.03)), t=g.vec(0, g.sub(g.mul(depth, -0.5), 8.0), 6.8)), M["warm"])

    segs = []
    tops = []
    z = PH
    seg_floors = []
    g.frame("Three chamfered (octagonal) segments with setbacks")
    for i, frac in enumerate((0.52, 0.28, 0.2)):
        nf = g.math("ROUND", g.mul(floors, frac))
        seg_floors.append(nf)
        h = g.mul(nf, FH)
        k = g.math("POWER", setback, i)
        sxw = g.mul(width, k)
        syd = g.mul(depth, k)
        # an 8-sided cylinder, rotated 22.5 deg so faces line up with the axes, scaled to W x D
        r = 1.0 / math.cos(PI / 8)
        body = g.cylinder(8, r * 0.5, 1.0)
        body = g.transform(body, r=(0, 0, PI / 8))
        zc = g.add(z, g.mul(h, 0.5))
        body = g.transform(body, t=g.vec(0, 0, zc), s=g.vec(sxw, syd, h))
        segs.append(g.setmat(body, M["curtain"]))
        # floor slabs
        slab_pts = g.points(g.line(g.add(nf, 1), g.vec(0, 0, z), (0, 0, FH)))
        slab = g.transform(g.transform(g.cylinder(8, r * 0.5, 0.3), r=(0, 0, PI / 8)), s=g.vec(g.add(sxw, 0.5), g.add(syd, 0.5), 1))
        slabs = g.setmat(g.realize(g.inst(slab_pts, slab)), M["metal"])
        segs.append(slabs)
        # fins on the long faces
        nfin = 16
        for sgn in (-1, 1):
            fpts = g.points(g.line(nfin, g.vec(g.mul(sxw, -0.33), g.mul(syd, 0.5 * sgn), zc), g.vec(g.div(g.mul(sxw, 0.66), nfin - 1), 0, 0)))
            fins = g.inst(fpts, g.cube((0.12, 0.7, 1)), scale=g.vec(1, 1, h))
            segs.append(g.setmat(g.realize(fins), M["metal"]))
        # LED lines on the four chamfers
        for cx, cy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            cpt = g.vec(g.mul(sxw, 0.5 * 0.82 * cx), g.mul(syd, 0.5 * 0.82 * cy), zc)
            for o in (-0.6, 0, 0.6):
                led = g.transform(g.cube((0.08, 0.08, 1)), t=g.vmath("ADD", cpt, g.vec(o * cy, -o * cx, 0)), s=g.vec(1, 1, h))
                segs.append(g.setmat(led, M["neon"]))
        z = g.add(z, h)
        tops.append((z, sxw, syd))

    g.frame("Giant ad screens on the lower segment")
    h0 = g.mul(seg_floors[0], FH)
    screen = g.setmat(g.transform(g.cube((1, 0.2, 1)), t=g.vec(g.mul(width, -0.18), g.sub(g.mul(depth, -0.5), 1.0), g.add(PH + 6, g.mul(h0, 0.3))),
                                  s=g.vec(g.mul(width, 0.4), 1, g.mul(h0, 0.45))), M["screen"])
    screen_frame = g.setmat(g.transform(g.cube((1, 0.4, 1)), t=g.vec(g.mul(width, -0.18), g.sub(g.mul(depth, -0.5), 0.75), g.add(PH + 6, g.mul(h0, 0.3))),
                                        s=g.vec(g.add(g.mul(width, 0.4), 0.6), 1, g.add(g.mul(h0, 0.45), 0.6))), M["frame"])
    side_screen = g.setmat(g.transform(g.cube((0.2, 1, 1)), t=g.vec(g.add(g.mul(width, 0.5), 1.0), 0, g.add(PH + 4, g.mul(h0, 0.6))),
                                       s=g.vec(1, g.mul(depth, 0.7), g.mul(depth, 0.4))), M["screen"])

    g.frame("Crown: name in neon, halo rings, spire, beacons")
    ztop, cw, cd = tops[-1]
    crown_box = g.setmat(g.transform(g.cube((1, 1, 1)), t=g.vec(0, 0, g.add(ztop, 3)), s=g.vec(g.mul(cw, 0.7), g.mul(cd, 0.7), 6)), M["metal"])
    name_t = g.group(neon_ng, String=name, Size=2.4, Tube=0.08).outputs[0]
    name_t = g.transform(name_t, t=g.vec(0, g.sub(g.mul(cd, -0.5), 0.6), g.sub(ztop, 3.4)), r=(0, 0, PI))
    name_board = g.setmat(g.transform(g.cube((1, 0.3, 3.4)), t=g.vec(0, g.sub(g.mul(cd, -0.5), 0.35), g.sub(ztop, 2.6)), s=g.vec(g.mul(cw, 0.9), 1, 1)), M["frame"])
    ring_r = g.mul(g.math("SQRT", g.add(g.mul(cw, cw), g.mul(cd, cd))), 0.45)
    ring1 = g.curve_to_mesh(g.curve_circle(ring_r, 96), g.curve_circle(0.14, 8))
    ring1 = g.setmat(g.transform(ring1, t=g.vec(0, 0, g.add(ztop, 10))), M["neon"])
    ring2 = g.curve_to_mesh(g.curve_circle(g.mul(ring_r, 0.78), 96), g.curve_circle(0.09, 8))
    ring2 = g.setmat(g.transform(ring2, t=g.vec(0, 0, g.add(ztop, 12.5))), M["neon"])
    spire = g.setmat(g.transform(g.cylinder(12, 0.35, 26), t=g.vec(0, 0, g.add(ztop, 19))), M["metalBare"])
    bpts = g.points(g.line(5, g.vec(0.4, 0.4, g.add(ztop, 8)), (0, 0, 6.5)))
    beacons = g.setmat(g.realize(g.inst(bpts, g.sphere(0.12, 10, 6))), M["beacon"])
    blades = []
    for cx, cy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        b = g.transform(g.cube((2.6, 0.4, 16)), r=(0.22 * cy, -0.22 * cx, math.atan2(cy, cx) + PI / 2))
        b = g.transform(b, t=g.vec(g.mul(cw, 0.4 * cx), g.mul(cd, 0.4 * cy), g.add(ztop, 7.5)))
        blades.append(g.setmat(b, M["metal"]))

    g.output(g.join(pod, pod_top, canopy, canopy_led, *segs, screen, screen_frame, side_screen, crown_box, name_t, name_board,
                    ring1, ring2, spire, beacons, *blades))
    return g.ng


def pod_face(M, K):
    g = G("CP_PodFace", modifier=False)
    floors = g.inp("Floors", "NodeSocketInt", 14, 1, 40)
    seed = g.inp("Seed", "NodeSocketInt", 0)
    dens = g.inp("Pod Density", "NodeSocketFloat", 0.85, 0, 1)
    acd = g.inp("AC Density", "NodeSocketFloat", 0.5, 0, 1)
    g.out("Geometry")
    FH = 2.62
    g.frame("Two pod slots per floor on a 5 m core face")
    pts = g.points(g.grid(2.44, g.mul(g.sub(floors, 1), FH), 2, floors))
    pts = g.transform(pts, t=g.vec(0, 2.5, g.add(1.2, g.mul(g.mul(g.sub(floors, 1), FH), 0.5))), r=(PI / 2, 0, 0))
    jitter = g.vec(g.rand_f(-0.05, 0.05, None, seed), g.rand_f(0.04, 0.3, None, g.add(seed, 1)), g.rand_f(-0.08, 0.08, None, g.add(seed, 2)))
    pts = g.setpos(pts, offset=jitter)
    sel = g.rand_b(dens, None, g.add(seed, 3))
    pods = g.inst(pts, g.obj(K["pod"]), sel=sel)
    g.frame("AC units hung on the pod sides")
    acp = g.setpos(pts, offset=g.vec(-1.19, g.rand_f(1.0, 3.0, None, g.add(seed, 5)), -0.9))
    acs = g.inst(acp, g.obj(K["ac"]), sel=g.bool_op("AND", sel, g.rand_b(acd, None, g.add(seed, 4))), rot=(0, 0, PI / 2), scale=0.85)
    g.output(g.join(pods, acs))
    return g.ng


def capsule(M, K, podface_ng, neon_ng):
    g = G("CP_Capsule")
    floors = g.inp("Pod Floors", "NodeSocketInt", 14, 4, 30)
    two = g.inp("Two Cores", "NodeSocketBool", True)
    dens = g.inp("Pod Density", "NodeSocketFloat", 0.85, 0, 1)
    acd = g.inp("AC Density", "NodeSocketFloat", 0.5, 0, 1)
    seed = g.inp("Seed", "NodeSocketInt", 11)
    word = g.inp("Podium Sign", "NodeSocketString", "KARAOKE")
    g.out("Geometry")
    GF, F1, FH = 4.6, 4.0, 2.62
    PT = GF + F1
    W, D = 24.0, 16.0

    g.frame("Night-market podium")
    mass = g.setmat(g.transform(g.cube((W - 6, D - 6, PT)), t=(0, 0, PT / 2)), M["concrete"])
    upper = g.setmat(g.transform(g.cube((W, D, F1 - 0.2)), t=(0, 0, GF + F1 / 2)), M["tile"])
    slab1 = g.setmat(g.transform(g.cube((W + 0.4, D + 0.4, 0.4)), t=(0, 0, GF)), M["slab"])
    slab2 = g.setmat(g.transform(g.cube((W + 0.6, D + 0.6, 0.3)), t=(0, 0, PT + 0.15)), M["slab"])
    cols = g.inst(g.points(g.grid(W, D, 7, 5)), g.cube((0.5, 0.5, GF)))
    cols = g.delete(cols, g.bool_op("AND", g.compare("LESS_THAN", g.math("ABSOLUTE", g.sep(g.pos())[0]), W / 2 - 0.1),
                                     g.compare("LESS_THAN", g.math("ABSOLUTE", g.sep(g.pos())[1]), D / 2 - 0.1)), "INSTANCE")
    cols = g.setmat(g.realize(g.transform(cols, t=(0, 0, GF / 2))), M["concrete"])

    g.frame("Stalls + lantern strings along the front arcade")
    stall_pts = g.points(g.line(5, (-9.6, -D / 2 + 2.0, 0), (4.8, 0, 0)))
    stalls = g.inst(stall_pts, g.obj(K["stall"]), rot=(0, 0, PI))
    lpts = g.points(g.line(30, (-W / 2 + 0.4, -D / 2 - 0.2, GF - 1.1), ((W - 0.8) / 29, 0, 0)))
    sag = g.mul(g.math("SINE", g.mul(g.sep(g.pos())[0], PI / 4.0)), 0.18)
    lpts = g.setpos(lpts, offset=g.vec(0, 0, g.math("ABSOLUTE", sag)))
    lanterns = g.inst(lpts, g.obj(K["lantern"]))
    shop_glass = g.setmat(g.transform(g.cube((W - 6.2, 0.05, 3.0)), t=(0, -D / 2 + 3.0, 1.7)), M["window"])

    g.frame("Neon word on the podium fascia")
    nw = g.group(neon_ng, String=word, Size=1.5, Tube=0.05).outputs[0]
    nw = g.transform(nw, t=(-4, -D / 2 - 0.3, GF + 1.5), r=(0, 0, PI))
    nb = g.setmat(g.transform(g.cube((11.0, 0.2, 2.2)), t=(-4, -D / 2 - 0.12, GF + 2.0)), M["frame"])

    g.frame("Core(s): concrete shafts with pods on all four faces")
    cores = []
    for ci, cx in enumerate((-6.2, 6.2, 0.0)):
        H = g.add(g.mul(floors, FH), 4.6 if ci != 1 else 4.6 - 2 * FH)
        shaft = g.setmat(g.transform(g.cube((5, 5, 1)), t=g.vec(0, 0, g.add(PT, g.mul(H, 0.5))), s=g.vec(1, 1, H)), M["concrete"])
        faces = []
        nf = floors if ci != 1 else g.sub(floors, 2)
        for k, rz in enumerate((0.0, PI / 2, PI, -PI / 2)):
            f = g.group(podface_ng, Floors=nf, Seed=g.add(seed, ci * 50 + k * 7), Pod_Density=dens, AC_Density=acd).outputs[0]
            faces.append(g.transform(f, t=(0, 0, PT + 0.6), r=(0, 0, rz)))
        led = g.setmat(g.transform(g.cube((0.08, 0.08, 1)), t=g.vec(2.52, -2.52, g.add(PT, g.mul(H, 0.5))), s=g.vec(1, 1, H)), M["neon"])
        tank = g.inst(g.points(g.line(1, g.vec(-1.0, 1.0, g.add(PT, H)), (0, 0, 0))), g.obj(K["tank"]))
        ant = g.inst(g.points(g.line(1, g.vec(1.4, 1.4, g.add(PT, H)), (0, 0, 0))), g.obj(K["antenna"]))
        core = g.transform(g.join(shaft, *faces, led, tank, ant), t=(cx, 0, 0))
        cores.append(core)
    pair = g.join(cores[0], cores[1])
    g.frame("Sky bridges between the two cores")
    bpts = g.points(g.line(g.math("FLOOR", g.div(floors, 4)), g.vec(0, 0, PT + 0.6 + 2 * FH + 1.2), (0, 0, 4 * FH)))
    bridges = g.setmat(g.realize(g.inst(bpts, g.cube((7.4, 2.6, 2.4)))), M["metal"])
    bridge_glow = g.setmat(g.realize(g.inst(bpts, g.cube((7.4, 2.7, 0.06)))), M["neon"])
    two_core = g.join(pair, bridges, bridge_glow)
    towers = g.switch("GEOMETRY", two, cores[2], two_core)

    g.frame("Vertical neon on the first core")
    vn = g.group(neon_ng, String="C\nA\nP\nS\nU\nL\nE", Size=1.1, Tube=0.045, Line_Spacing=1.15).outputs[0]
    vn_board = g.setmat(g.transform(g.cube((1.5, 0.22, 10.6)), t=(0, -0.15, -4.4)), M["frame"])
    vsign = g.transform(g.join(vn, vn_board), t=(0, 0, PT + 22))
    vsign = g.transform(g.transform(vsign, t=(0, 2.6, 0)), r=(0, 0, PI + PI / 4))
    vsign = g.transform(vsign, t=g.vec(g.switch("FLOAT", two, -2.5, -8.7), -2.5, 0))

    g.output(g.join(mass, upper, slab1, slab2, cols, stalls, lanterns, shop_glass, nw, nb, towers, vsign))
    return g.ng


def build_all(M, K, C, font):
    neon_ng = neon_text(M, font)
    blade_ng = blade_sign(M, neon_ng)
    # blade sign variants, built once, picked per point
    tmp = G("CP_BladeVariants", modifier=False)
    tmp.out("Geometry")
    tmp.frame("One blade sign per word")
    vars_ = []
    for w in BLADE_WORDS:
        vertical = "\n".join(list(w))
        vars_.append(tmp.group(blade_ng, String=vertical, Size=0.8, Chars=len(w)).outputs[0])
    tmp.output(tmp.to_instances(*vars_))
    blades_ng = tmp.ng
    facade = hive_facade(M, K, C, blades_ng)
    hv = hive(M, K, C, facade, neon_ng)
    ar = arcology(M, K, neon_ng)
    pf = pod_face(M, K)
    cp = capsule(M, K, pf, neon_ng)
    return {"hive": hv, "arcology": ar, "capsule": cp}
