"""Small helper layer for building Geometry Nodes trees from Python (Blender 5.1).

Every helper takes either a socket or a plain value: values become socket
defaults, sockets get linked. Nodes are laid out in labelled frames so the
generated trees stay readable when opened in Blender.
"""
import bpy

NodeSocket = bpy.types.NodeSocket


class G:
    def __init__(self, name, modifier=True):
        old = bpy.data.node_groups.get(name)
        if old:
            bpy.data.node_groups.remove(old)
        self.ng = bpy.data.node_groups.new(name, "GeometryNodeTree")
        try:
            self.ng.is_modifier = modifier
        except AttributeError:
            pass
        self.nodes = self.ng.nodes
        self.links = self.ng.links
        self.gin = self.nodes.new("NodeGroupInput")
        self.gout = self.nodes.new("NodeGroupOutput")
        self.gin.location = (-600, 0)
        self._frame = None
        self._fx = 0
        self._fy = 0
        self._fcount = 0
        self._col = 0
        self._row = 0

    # ------------------------------------------------------------ interface
    def inp(self, name, stype, default=None, lo=None, hi=None, desc=""):
        s = self.ng.interface.new_socket(name=name, in_out="INPUT", socket_type=stype)
        if default is not None:
            s.default_value = default
        if lo is not None:
            s.min_value = lo
        if hi is not None:
            s.max_value = hi
        if desc:
            s.description = desc
        return self.gin.outputs[name]

    def out(self, name, stype="NodeSocketGeometry"):
        self.ng.interface.new_socket(name=name, in_out="OUTPUT", socket_type=stype)
        return self.gout.inputs[name]

    # ------------------------------------------------------------ layout
    def frame(self, label):
        f = self.nodes.new("NodeFrame")
        f.label = label
        f.label_size = 28
        self._frame = f
        self._col = 0
        self._row = 0
        self._fx = (self._fcount % 3) * 2600
        self._fy = -(self._fcount // 3) * 1500
        self._fcount += 1
        return f

    def _place(self, node):
        node.location = (self._fx + self._col * 210, self._fy - self._row * 230)
        self._row += 1
        if self._row >= 5:
            self._row = 0
            self._col += 1
        if self._frame:
            node.parent = self._frame

    # ------------------------------------------------------------ core
    def n(self, ntype, **props):
        node = self.nodes.new(ntype)
        for k, v in props.items():
            setattr(node, k, v)
        self._place(node)
        return node

    def set(self, sock, v):
        if v is None:
            return
        if isinstance(v, NodeSocket):
            self.links.new(v, sock)
        else:
            if isinstance(v, (int, float)) and not isinstance(v, bool) and sock.type == "VECTOR":
                v = (v, v, v)
            sock.default_value = v

    def link(self, a, b):
        self.links.new(a, b)

    # ------------------------------------------------------------ fields / math
    def math(self, op, a, b=None, c=None):
        m = self.n("ShaderNodeMath", operation=op)
        self.set(m.inputs[0], a)
        if b is not None:
            self.set(m.inputs[1], b)
        if c is not None:
            self.set(m.inputs[2], c)
        return m.outputs[0]

    def add(self, a, b): return self.math("ADD", a, b)
    def sub(self, a, b): return self.math("SUBTRACT", a, b)
    def mul(self, a, b): return self.math("MULTIPLY", a, b)
    def div(self, a, b): return self.math("DIVIDE", a, b)

    def vec(self, x=0.0, y=0.0, z=0.0):
        c = self.n("ShaderNodeCombineXYZ")
        self.set(c.inputs[0], x)
        self.set(c.inputs[1], y)
        self.set(c.inputs[2], z)
        return c.outputs[0]

    def sep(self, v):
        s = self.n("ShaderNodeSeparateXYZ")
        self.set(s.inputs[0], v)
        return s.outputs[0], s.outputs[1], s.outputs[2]

    def vmath(self, op, a, b=None, scale=None):
        m = self.n("ShaderNodeVectorMath", operation=op)
        self.set(m.inputs[0], a)
        if b is not None:
            self.set(m.inputs[1], b)
        if scale is not None:
            self.set(m.inputs[3], scale)
        return m.outputs[0]

    def pos(self):
        return self.n("GeometryNodeInputPosition").outputs[0]

    def index(self):
        return self.n("GeometryNodeInputIndex").outputs[0]

    def rand_f(self, lo, hi, id=None, seed=None):
        r = self.n("FunctionNodeRandomValue", data_type="FLOAT")
        self.set(r.inputs[2], lo)
        self.set(r.inputs[3], hi)
        self.set(r.inputs[7], id)
        self.set(r.inputs[8], seed)
        return r.outputs[1]

    def rand_i(self, lo, hi, id=None, seed=None):
        r = self.n("FunctionNodeRandomValue", data_type="INT")
        self.set(r.inputs[4], lo)
        self.set(r.inputs[5], hi)
        self.set(r.inputs[7], id)
        self.set(r.inputs[8], seed)
        return r.outputs[2]

    def rand_b(self, prob, id=None, seed=None):
        r = self.n("FunctionNodeRandomValue", data_type="BOOLEAN")
        self.set(r.inputs[6], prob)
        self.set(r.inputs[7], id)
        self.set(r.inputs[8], seed)
        return r.outputs[3]

    def compare(self, op, a, b, dtype="FLOAT"):
        c = self.n("FunctionNodeCompare", data_type=dtype, operation=op)
        if dtype == "INT":
            self.set(c.inputs[2], a)
            self.set(c.inputs[3], b)
        else:
            self.set(c.inputs[0], a)
            self.set(c.inputs[1], b)
        return c.outputs[0]

    def bool_op(self, op, a, b=None):
        m = self.n("FunctionNodeBooleanMath", operation=op)
        self.set(m.inputs[0], a)
        if b is not None:
            self.set(m.inputs[1], b)
        return m.outputs[0]

    def switch(self, itype, cond, a, b):
        s = self.n("GeometryNodeSwitch", input_type=itype)
        self.set(s.inputs[0], cond)
        self.set(s.inputs[1], a)
        self.set(s.inputs[2], b)
        return s.outputs[0]

    def euler(self, v):
        """Euler vector -> rotation socket"""
        try:
            e = self.n("FunctionNodeEulerToRotation")
            self.set(e.inputs[0], v)
            return e.outputs[0]
        except RuntimeError:
            return v

    # ------------------------------------------------------------ geometry
    def cube(self, size=(1, 1, 1)):
        c = self.n("GeometryNodeMeshCube")
        self.set(c.inputs["Size"], size)
        return c.outputs["Mesh"]

    def cylinder(self, verts=12, radius=1.0, depth=1.0):
        c = self.n("GeometryNodeMeshCylinder")
        self.set(c.inputs["Vertices"], verts)
        self.set(c.inputs["Radius"], radius)
        self.set(c.inputs["Depth"], depth)
        return c.outputs["Mesh"]

    def sphere(self, radius=0.1, seg=12, rings=8):
        s = self.n("GeometryNodeMeshUVSphere")
        self.set(s.inputs["Segments"], seg)
        self.set(s.inputs["Rings"], rings)
        self.set(s.inputs["Radius"], radius)
        return s.outputs["Mesh"]

    def grid(self, sx, sy, vx, vy):
        g = self.n("GeometryNodeMeshGrid")
        self.set(g.inputs["Size X"], sx)
        self.set(g.inputs["Size Y"], sy)
        self.set(g.inputs["Vertices X"], vx)
        self.set(g.inputs["Vertices Y"], vy)
        return g.outputs["Mesh"]

    def line(self, count, start=(0, 0, 0), offset=(1, 0, 0)):
        l = self.n("GeometryNodeMeshLine")
        self.set(l.inputs["Count"], count)
        self.set(l.inputs["Start Location"], start)
        self.set(l.inputs["Offset"], offset)
        return l.outputs["Mesh"]

    def points(self, mesh):
        p = self.n("GeometryNodeMeshToPoints")
        self.set(p.inputs["Mesh"], mesh)
        return p.outputs["Points"]

    def transform(self, geo, t=None, r=None, s=None):
        x = self.n("GeometryNodeTransform")
        self.set(x.inputs["Geometry"], geo)
        self.set(x.inputs["Translation"], t)
        if r is not None:
            if isinstance(r, NodeSocket):
                self.set(x.inputs["Rotation"], self.euler(r))
            else:
                x.inputs["Rotation"].default_value = r
        self.set(x.inputs["Scale"], s)
        return x.outputs[0]

    def inst(self, pts, instance, sel=None, rot=None, scale=None, pick=False, idx=None):
        n = self.n("GeometryNodeInstanceOnPoints")
        self.set(n.inputs["Points"], pts)
        self.set(n.inputs["Instance"], instance)
        self.set(n.inputs["Selection"], sel)
        if rot is not None:
            if isinstance(rot, NodeSocket):
                self.set(n.inputs["Rotation"], self.euler(rot))
            else:
                n.inputs["Rotation"].default_value = rot
        self.set(n.inputs["Scale"], scale)
        if pick:
            n.inputs["Pick Instance"].default_value = True
            self.set(n.inputs["Instance Index"], idx)
        return n.outputs[0]

    def join(self, *geos):
        j = self.n("GeometryNodeJoinGeometry")
        for g in reversed([g for g in geos if g is not None]):
            self.links.new(g, j.inputs[0])
        return j.outputs[0]

    def setpos(self, geo, sel=None, pos=None, offset=None):
        s = self.n("GeometryNodeSetPosition")
        self.set(s.inputs["Geometry"], geo)
        self.set(s.inputs["Selection"], sel)
        self.set(s.inputs["Position"], pos)
        self.set(s.inputs["Offset"], offset)
        return s.outputs[0]

    def delete(self, geo, sel, domain="POINT"):
        d = self.n("GeometryNodeDeleteGeometry", domain=domain)
        self.set(d.inputs["Geometry"], geo)
        self.set(d.inputs["Selection"], sel)
        return d.outputs[0]

    def obj(self, ob):
        o = self.n("GeometryNodeObjectInfo")
        o.inputs["Object"].default_value = ob
        return o.outputs["Geometry"]

    def coll(self, col):
        c = self.n("GeometryNodeCollectionInfo")
        c.inputs["Collection"].default_value = col
        c.inputs["Separate Children"].default_value = True
        c.inputs["Reset Children"].default_value = True
        return c.outputs[0]

    def to_instances(self, *geos):
        g2i = self.n("GeometryNodeGeometryToInstance")
        for g in reversed(geos):
            self.links.new(g, g2i.inputs[0])
        return g2i.outputs[0]

    def setmat(self, geo, mat, sel=None):
        s = self.n("GeometryNodeSetMaterial")
        self.set(s.inputs["Geometry"], geo)
        s.inputs["Material"].default_value = mat
        self.set(s.inputs["Selection"], sel)
        return s.outputs[0]

    def group(self, ng, **inputs):
        g = self.n("GeometryNodeGroup")
        g.node_tree = ng
        for k, v in inputs.items():
            self.set(g.inputs[k.replace("_", " ")], v)
        return g

    def realize(self, geo):
        r = self.n("GeometryNodeRealizeInstances")
        self.set(r.inputs[0], geo)
        return r.outputs[0]

    def smooth(self, geo, on=True):
        s = self.n("GeometryNodeSetShadeSmooth")
        self.set(s.inputs["Geometry"], geo)
        s.inputs["Shade Smooth"].default_value = on
        return s.outputs[0]

    def string_curves(self, text, size, font=None, align_x="CENTER", line_spacing=1.0):
        s = self.n("GeometryNodeStringToCurves")
        self.set(s.inputs["String"], text)
        self.set(s.inputs["Size"], size)
        if font is not None:
            s.inputs["Font"].default_value = font
        try:
            s.inputs["Align X"].default_value = align_x
        except Exception:
            pass
        self.set(s.inputs["Line Spacing"], line_spacing)
        return s.outputs[0]

    def curve_circle(self, radius, res=8):
        c = self.n("GeometryNodeCurvePrimitiveCircle")
        self.set(c.inputs["Resolution"], res)
        self.set(c.inputs["Radius"], radius)
        return c.outputs["Curve"]

    def curve_to_mesh(self, curve, profile, caps=False):
        c = self.n("GeometryNodeCurveToMesh")
        self.set(c.inputs["Curve"], curve)
        self.set(c.inputs["Profile Curve"], profile)
        self.set(c.inputs["Fill Caps"], caps)
        return c.outputs[0]

    def fill_curve(self, curve):
        f = self.n("GeometryNodeFillCurve")
        self.set(f.inputs[0], curve)
        return f.outputs[0]

    def store(self, geo, name, value, dtype="FLOAT", domain="INSTANCE"):
        s = self.n("GeometryNodeStoreNamedAttribute", data_type=dtype, domain=domain)
        self.set(s.inputs["Geometry"], geo)
        s.inputs["Name"].default_value = name
        self.set(s.inputs["Value"], value)
        return s.outputs[0]

    def output(self, geo, name="Geometry"):
        self.link(geo, self.gout.inputs[name])
