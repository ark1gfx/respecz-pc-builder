"""Builds the ReSpecz 3D PC in Blender from code and exports assets/pc.glb.

Run headless:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/build_pc.py -- assets/pc.glb

Coordinates in this script are the website's (three.js, Y up, centimetres):
  x = side (glass panel at +x in the numbers, mirrored to -x by V), y = up, z = front (+z).
Every clickable part hangs under an empty named part_<category>. Spinning fan rotors are
named rotor_*, and spin around their local Y axis in three.js.
Hole patterns (perforated metal, PCB traces) are added in the browser by material name.
"""
import math
import sys

import bpy
from mathutils import Vector

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'pc.glb'

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# Real ATX layout: seen from the front, the glass side is on the LEFT. The part layout below is
# written with the glass at +x; MIRROR_X puts it at -x so the build is not mirror-imaged.
MIRROR_X = -1


def V(x, y, z):
    return Vector((MIRROR_X * x, -z, y))


# ---------------------------------------------------------------- materials
def mat(name, color, metallic=0.0, rough=0.5, emit=None, strength=0.0, transmission=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = rough
    if emit:
        p.inputs['Emission Color'].default_value = (*emit, 1)
        p.inputs['Emission Strength'].default_value = strength
    if transmission:
        p.inputs['Transmission Weight'].default_value = transmission
        p.inputs['IOR'].default_value = 1.5
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha
    return m


M = {
    'case': mat('case_black', (0.018, 0.019, 0.022), 0.55, 0.42),
    'inner': mat('case_inner', (0.022, 0.023, 0.027), 0.4, 0.6),
    'perf': mat('perf_metal', (0.03, 0.031, 0.035), 0.75, 0.38),
    'pcb': mat('pcb', (0.02, 0.022, 0.028), 0.1, 0.55),
    'pcb_face': mat('pcb_face', (1, 1, 1), 0.15, 0.5),
    'silver': mat('silver_armor', (0.55, 0.57, 0.61), 1.0, 0.24),
    'slot_light': mat('slot_light', (0.32, 0.33, 0.36), 0.0, 0.45),
    'tray': mat('case_tray', (0.075, 0.077, 0.085), 0.25, 0.55),
    'armor': mat('armor_dark', (0.03, 0.031, 0.035), 0.75, 0.36),
    'armor_light': mat('armor_light', (0.11, 0.115, 0.125), 0.85, 0.3),
    'fin_black': mat('fin_black', (0.02, 0.021, 0.024), 0.6, 0.45),
    'cooler_display': mat('cooler_display', (1, 1, 1), 0.0, 0.25),
    **{f'argb_seg_{i}': mat(f'argb_seg_{i}', (0.05, 0.05, 0.05), 0.0, 0.4, emit=c, strength=2.0)
       for i, c in enumerate([(1, 0.2, 0.35), (1, 0.6, 0.1), (1, 0.9, 0.3), (0.25, 1, 0.5), (0.15, 0.8, 1), (0.3, 0.45, 1), (0.75, 0.35, 1)])},
    'argb_flow': mat('argb_flow', (1, 1, 1), 0.0, 0.4, emit=(1, 1, 1), strength=1.0),
    'argb_strip': mat('argb_strip', (0.08, 0.02, 0.08), 0.0, 0.4, emit=(1.0, 0.24, 0.92), strength=2.2),
    'argb': mat('argb', (0.05, 0.05, 0.06), 0.0, 0.4, emit=(1, 1, 1), strength=2.0),
    'tube': mat('tube_braided', (0.008, 0.008, 0.01), 0.1, 0.5),
    'glass_black': mat('glass_black', (0.01, 0.012, 0.016), 0.2, 0.08),
    'rad_fins': mat('rad_fins', (0.06, 0.063, 0.07), 0.8, 0.45),
    'accent': mat('accent_print', (0.05, 0.25, 0.7), 0.0, 0.4, emit=(0.30, 0.64, 1.0), strength=1.5),
    'alu': mat('alu_fin', (0.62, 0.64, 0.68), 1.0, 0.3),
    'alu_dark': mat('alu_dark', (0.055, 0.058, 0.065), 0.9, 0.33),
    'gunmetal': mat('gunmetal', (0.16, 0.17, 0.19), 0.95, 0.28),
    'nickel': mat('nickel', (0.78, 0.78, 0.8), 1.0, 0.18),
    'plastic': mat('plastic_black', (0.012, 0.012, 0.014), 0.0, 0.62),
    'fan_frame': mat('fan_frame', (0.012, 0.012, 0.014), 0.0, 0.6),
    'fan_pad': mat('fan_pad', (0.09, 0.092, 0.1), 0.0, 0.75),
    'hole': mat('hole_dark', (0.002, 0.002, 0.003), 0.0, 0.9),
    'hub_cap': mat('hub_cap', (0.03, 0.032, 0.036), 0.2, 0.42),
    'blade': mat('fan_blade', (0.02, 0.021, 0.025), 0.0, 0.45),
    'sleeve': mat('cable_sleeve', (0.01, 0.01, 0.012), 0.0, 0.85),
    'slot': mat('slot_plastic', (0.03, 0.03, 0.035), 0.0, 0.5),
    'gold': mat('gold_pins', (0.85, 0.65, 0.3), 1.0, 0.3),
    'label': mat('label_grey', (0.22, 0.23, 0.26), 0.2, 0.5),
    'white': mat('silk_white', (0.8, 0.82, 0.85), 0.0, 0.4),
    'glass': mat('glass', (0.92, 0.95, 1.0), 0.0, 0.03, transmission=1.0),
    'blue': mat('glow_blue', (0.02, 0.06, 0.12), 0, 0.4, emit=(0.30, 0.64, 1.0), strength=6),
    'violet': mat('glow_violet', (0.05, 0.02, 0.1), 0, 0.4, emit=(0.55, 0.36, 0.97), strength=6),
    'diffuser': mat('glow_diffuser', (0.05, 0.08, 0.15), 0, 0.3, emit=(0.38, 0.62, 1.0), strength=4),
}


# ---------------------------------------------------------------- helpers
def part(cat):
    e = bpy.data.objects.new(f'part_{cat}', None)
    scene.collection.objects.link(e)
    return e


def finish(o, parent, material, bevel=0.0, seg=3, smooth=True):
    if material:
        o.data.materials.clear()
        o.data.materials.append(material)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width = bevel
        b.segments = seg
        b.limit_method = 'ANGLE'
        b.harden_normals = True
    if smooth:
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
        o.select_set(False)
    o.parent = parent
    return o


def box(name, parent, size, pos, material, bevel=0.12, seg=3, rot=(0, 0, 0)):
    """size and pos in site coords (w = x, h = y, d = z)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=V(*pos))
    o = bpy.context.object
    o.name = name
    o.scale = (size[0], size[2], size[1])
    o.rotation_euler = (rot[0], -rot[2], rot[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, parent, material, bevel, seg)


AXIS_ROT = {'x': (0, math.radians(90), 0), 'y': (0, 0, 0), 'z': (math.radians(90), 0, 0)}


def cyl(name, parent, r, depth, pos, axis, material, verts=32, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=V(*pos), rotation=AXIS_ROT[axis])
    o = bpy.context.object
    o.name = name
    return finish(o, parent, material, bevel, 2)


def join(objs, name):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        for m in o.modifiers:
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=m.name)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    o.select_set(False)
    return o


def cut(target, cutter):
    m = target.modifiers.new('cut', 'BOOLEAN')
    m.operation = 'DIFFERENCE'
    m.object = cutter
    m.solver = 'EXACT'
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier='cut')
    bpy.data.objects.remove(cutter, do_unlink=True)


def cable(name, parent, points, radius=0.32, material=None):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = 4
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = V(*p)
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, cu)
    scene.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.object
    o.select_set(False)
    return finish(o, parent, material or M['sleeve'])


def _mesh_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    return o


def _apply_all(o):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def _outward(o):
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()


def fan(name, parent, size, center, axis, ring_mat, blades=7, hub_ring=None):
    """120 mm-class fan modelled on the user's reference (2026-11-22): rounded square frame with
    corner pads + mounting holes, chamfered opening, 7 broad swept blades, big hub, 3 rear struts.
    Built in Blender local XY (spin axis Z), then turned to `axis`. Rotor = rotor_<name>."""
    import bmesh
    s = size
    t = 2.5
    r_in = s * 0.47
    half = s / 2
    rc = s * 0.09  # outer corner radius

    # ---- frame: rounded-square plate with a round opening (vertex-built, no boolean)
    def rounded_square_point(ang):
        c, sn = math.cos(ang), math.sin(ang)
        k = half / max(abs(c), abs(sn))
        x, y = k * c, k * sn
        cx, cy = half - rc, half - rc
        if abs(x) > cx and abs(y) > cy:  # inside a rounded corner: project onto the corner arc
            ox, oy = math.copysign(cx, x), math.copysign(cy, y)
            # ray from origin intersecting the corner circle
            dx, dy = c, sn
            bq = -2 * (dx * ox + dy * oy)
            cq = ox * ox + oy * oy - rc * rc
            disc = max(bq * bq - 4 * cq, 0)
            tt = (-bq + math.sqrt(disc)) / 2
            x, y = dx * tt, dy * tt
        return x, y

    seg = 96
    bm = bmesh.new()
    inner, outer = [], []
    for i in range(seg):
        ang = 2 * math.pi * i / seg
        inner.append(bm.verts.new((r_in * math.cos(ang), r_in * math.sin(ang), 0)))
        ox, oy = rounded_square_point(ang)
        outer.append(bm.verts.new((ox, oy, 0)))
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new((inner[i], outer[i], outer[j], inner[j]))
    frame = _mesh_obj(f'{name}_frame', bm)
    sol = frame.modifiers.new('depth', 'SOLIDIFY')
    sol.thickness = t
    sol.offset = 0
    _apply_all(frame)
    _outward(frame)
    bev = frame.modifiers.new('chamfer', 'BEVEL')
    bev.width = 0.22
    bev.segments = 2
    bev.limit_method = 'ANGLE'
    bev.angle_limit = math.radians(50)
    _apply_all(frame)

    # corner pads (grey rubber) with mounting holes, front and back
    extras = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            px, py = sx * (half - s * 0.085), sy * (half - s * 0.085)
            for face_z in (t / 2, -t / 2):
                bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=s * 0.06, depth=0.16, location=(px, py, face_z))
                pad = bpy.context.object
                pad.data.materials.append(M['fan_pad'])
                extras.append(pad)
                bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=s * 0.028, depth=0.2, location=(px, py, face_z + math.copysign(0.02, face_z)))
                hole = bpy.context.object
                hole.data.materials.append(M['hole'])
                extras.append(hole)
    # thin lit lip just inside the opening (front face)
    bpy.ops.mesh.primitive_torus_add(major_radius=r_in - 0.05, minor_radius=0.07, major_segments=96, minor_segments=6, location=(0, 0, t / 2 - 0.15))
    lip = bpy.context.object
    lip.data.materials.append(ring_mat)
    extras.append(lip)
    if hub_ring is not None:  # ARGB fans: one LED strip per outer edge; the browser paints a smooth,
        # flowing rainbow on 'argb_flow' from world position (no colour blocks)
        for (dx, dy, sx, sy) in ((half + 0.04, 0, 0.1, s * 0.72), (-half - 0.04, 0, 0.1, s * 0.72),
                                 (0, half + 0.04, s * 0.72, 0.1), (0, -half - 0.04, s * 0.72, 0.1)):
            bpy.ops.mesh.primitive_cube_add(size=1, location=(dx, dy, 0))
            led = bpy.context.object
            led.scale = (sx, sy, t * 0.42)
            bpy.ops.object.transform_apply(scale=True)
            led.data.materials.append(M['argb_flow'])
            extras.append(led)
    if hub_ring is not None:  # lit ring around the hub (ARGB fans)
        bpy.ops.mesh.primitive_torus_add(major_radius=s * 0.215, minor_radius=0.09, major_segments=72, minor_segments=6, location=(0, 0, 1.0))
        hr = bpy.context.object
        hr.data.materials.append(hub_ring)
        extras.append(hr)
    # rear struts + motor housing
    for k in range(3):
        a = math.radians(90 + k * 120)
        bpy.ops.mesh.primitive_cube_add(size=1)
        st = bpy.context.object
        st.scale = (r_in - s * 0.2, 0.32, 0.3)
        bpy.ops.object.transform_apply(scale=True)
        mid = (r_in + s * 0.2) / 2
        st.location = (mid * math.cos(a), mid * math.sin(a), -t / 2 + 0.25)
        st.rotation_euler = (0, 0, a)
        bpy.ops.object.transform_apply(location=True, rotation=True)
        st.data.materials.append(M['fan_frame'])
        extras.append(st)
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=s * 0.19, depth=0.5, location=(0, 0, -t / 2 + 0.3))
    housing = bpy.context.object
    housing.data.materials.append(M['fan_frame'])
    extras.append(housing)

    frame.data.materials.clear()
    frame.data.materials.append(M['fan_frame'])
    static = join([frame] + extras, f'{name}_frame')
    static.location = V(*center)
    static.rotation_euler = AXIS_ROT[axis]
    bpy.context.view_layer.objects.active = static
    static.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    static.select_set(False)
    static.parent = parent

    # ---- rotor: 7 broad swept blades + big hub with a domed cap
    r_hub = s * 0.2
    r_tip = s * 0.445
    parts_ = []
    nr, nc = 9, 7
    for bi in range(blades):
        base = 2 * math.pi * bi / blades
        bm = bmesh.new()
        grid = []
        for ri in range(nr):
            f = ri / (nr - 1)
            r = r_hub * 0.97 + (r_tip - r_hub * 0.97) * f
            width = math.radians(26 + 22 * f ** 1.3)       # wider toward the tip
            sweep = math.radians(38) * f ** 1.4               # swept (scimitar) shape
            span = 1.55 - 0.65 * f                            # more pitch near the hub (twist)
            row = []
            for ci in range(nc):
                u = ci / (nc - 1)
                th = base + sweep + width * (u - 0.5)
                # slight camber: the middle of the chord bulges
                z = (0.5 - u) * span + 0.12 * math.sin(math.pi * u)
                row.append(bm.verts.new((r * math.cos(th), r * math.sin(th), z)))
            grid.append(row)
        for ri in range(nr - 1):
            for ci in range(nc - 1):
                bm.faces.new((grid[ri][ci], grid[ri + 1][ci], grid[ri + 1][ci + 1], grid[ri][ci + 1]))
        blade = _mesh_obj(f'{name}_blade{bi}', bm)
        thick = blade.modifiers.new('thick', 'SOLIDIFY')
        thick.thickness = 0.13
        thick.offset = 0
        _apply_all(blade)
        _outward(blade)
        blade.data.materials.append(M['blade'])
        parts_.append(blade)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=r_hub, depth=1.7, location=(0, 0, 0.05))
    hub = bpy.context.object
    hub.data.materials.append(M['blade'])
    hb = hub.modifiers.new('round', 'BEVEL')
    hb.width = 0.18
    hb.segments = 3
    parts_.append(hub)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=12, radius=r_hub * 0.96, location=(0, 0, 0.9))
    cap = bpy.context.object
    cap.scale = (1, 1, 0.12)
    bpy.ops.object.transform_apply(scale=True)
    cap.data.materials.append(M['hub_cap'])
    parts_.append(cap)
    rotor = join(parts_, f'rotor_{name}')
    rotor.location = V(*center)
    rotor.rotation_euler = AXIS_ROT[axis]
    bpy.context.view_layer.objects.active = rotor
    rotor.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(45))
    rotor.select_set(False)
    rotor.parent = parent
    return static


# ================================================================ CASE
case = part('case')
box('case_back', case, (0.8, 46, 44), (-10.6, 0, 0), M['case'], 0.3)
box('case_tray', case, (0.06, 43, 41), (-10.19, 0, 0), M['tray'], 0.0)
box('case_top', case, (22, 1.0, 44), (0, 22.5, 0), M['case'], 0.5, 4)
box('case_top_mesh', case, (17, 0.2, 34), (0, 23.05, -1), M['perf'], 0.05)
box('case_bottom', case, (22, 1.0, 44), (0, -22.5, 0), M['case'], 0.5, 4)
box('case_rear', case, (22, 46, 0.8), (0, 0, -21.6), M['case'], 0.3)
box('case_front', case, (22, 46, 1.2), (0, 0, 21.4), M['case'], 0.5, 4)
box('case_front_mesh', case, (18, 42, 0.2), (0, 0, 22.05), M['perf'], 0.05)
box('case_front_strip', case, (0.35, 38, 0.3), (9.9, 0, 22.1), M['blue'], 0.08)
# rear slot covers + IO cutout + rear fan grill
for i in range(7):
    box(f'case_slot_{i}', case, (0.2, 1.5, 0.5), (-4 - 0.0, -1.2 - i * 2.0, -22.1), M['gunmetal'], 0.05)
box('case_io_cut', case, (3.6, 8.4, 0.3), (-8, 15, -22.05), M['plastic'], 0.05)
for z in (-17.6, 17.6):  # angular full-width feet front and rear
    box('case_foot', case, (21.0, 1.5, 5.5), (0, -23.7, z), M['case'], 0.65, 2)
# PSU shroud (covers the front of the basement)
# full-length PSU shroud: top plate over everything, glass-side wall only at the front, so the PSU sits
# in an open recess at the rear (like the reference); ends before the front fans
box('case_shroud', case, (21.0, 0.45, 38.6), (0, -13.8, -1.9), M['inner'], 0.15)
box('case_shroud_side', case, (0.45, 8.3, 23.4), (10.3, -18.0, 5.7), M['inner'], 0.15)
box('case_shroud_front', case, (21.0, 8.3, 0.45), (0, -18.0, 17.2), M['inner'], 0.15)
box('case_shroud_vent', case, (9.0, 0.12, 7.0), (2.0, -13.55, 11.5), M['perf'], 0.02)
box('case_shroud_strip', case, (0.12, 0.3, 21.0), (10.55, -14.4, 5.7), M['argb_flow'], 0.04)
box('case_psu_recess_lip', case, (0.5, 8.3, 0.5), (10.3, -18.0, -5.9), M['case'], 0.1)
# grommets
for cy, h in ((9.5, 11.0), (-6.5, 9.0)):  # two tall cable cut-outs with rubber grommets
    box('case_cutout_rim', case, (0.12, h + 0.7, 3.7), (-10.12, cy, 6.6), M['plastic'], 1.0, 4)
    box('case_cutout', case, (0.14, h, 3.0), (-10.08, cy, 6.6), M['hole'], 0.8, 4)
# glass side with a black print border
box('case_glass', case, (0.4, 44.2, 42.6), (10.85, 0, 0), M['glass'], 0.15)
for size, pos in [((0.1, 1.8, 42.6), (11.08, 21.2, 0)), ((0.1, 1.8, 42.6), (11.08, -21.2, 0)),
                  ((0.1, 44.2, 1.4), (11.08, 0, 20.6)), ((0.1, 44.2, 1.4), (11.08, 0, -20.6))]:
    box('case_glass_print', case, size, pos, M['plastic'], 0.0)
# case fans: two front intake, one rear exhaust
for i, fy in enumerate((13.5, 1.0, -11.5)):
    fan(f'fan_front_{i}', case, 12, (0.5, fy, 19.4), 'z', M['argb'], hub_ring=M['argb'])
for i, fz in enumerate((-7.5, 5.5)):
    fan(f'fan_top_{i}', case, 12, (1.0, 19.7, fz), 'y', M['argb'], hub_ring=M['argb'])
fan('fan_rear', case, 12, (0.5, 13.5, -20.0), 'z', M['argb'], hub_ring=M['argb'])

# ================================================================ MOTHERBOARD (ATX)
# Layout follows a real ATX gaming board (user reference, 2026-11-22): tall rear-I/O cover top-left,
# angled VRM heatsinks, socket upper-middle, 4 DIMMs + 24-pin on the right, long M.2 plate over the
# steel PCIe x16, stacked M.2 plates, tall chipset block bottom-right, audio bottom-left.
# Site coords: board z -20.5 (rear/I-O) .. 3.9 (front), y 19.5 (top) .. -11 (bottom).
mb = part('motherboard')
box('mb_pcb', mb, (0.18, 30.5, 24.4), (-10.05, 4.25, -8.3), M['pcb'], 0.08)
bpy.ops.mesh.primitive_plane_add(size=1, location=V(-9.95, 4.25, -8.3), rotation=(0, math.radians(-90 * MIRROR_X), 0))
face = bpy.context.object
face.name = 'mb_pcb_face'
face.scale = (30.3, 24.2, 1)
bpy.ops.object.transform_apply(scale=True)
finish(face, mb, M['pcb_face'], smooth=False)


def chevron(parent, cx, cy, cz, size, mat):
    """ReSpecz 'speed stripes' emblem printed on a heatsink face (three slanted bars), faces the glass."""
    for i in range(3):
        box('mb_emblem', parent, (0.07, size * (0.9 - i * 0.18), 0.2), (cx, cy - i * size * 0.06, cz - size * 0.28 + i * size * 0.28), mat, 0.0,
            rot=(math.radians(28), 0, 0))


# rear I/O cover (tall, top-left) with a silver edge strip and emblem
box('mb_io_cover', mb, (3.6, 17.3, 4.4), (-8.3, 10.85, -18.1), M['armor'], 0.35)
box('mb_io_edge', mb, (3.7, 17.0, 0.35), (-8.25, 10.85, -20.25), M['silver'], 0.1)
box('mb_io_inlay', mb, (0.1, 8.5, 3.2), (-6.48, 14.6, -18.1), M['armor_light'], 0.15)
chevron(mb, -6.4, 14.6, -18.1, 2.6, M['accent'])
for i in range(3):
    for j in range(3):
        cyl('mb_io_dot', mb, 0.13, 0.12, (-6.47, 4.6 + i * 0.45, -18.6 + j * 0.45), 'x', M['plastic'], 12)
# angled left VRM heatsink with slanted grooves
box('mb_vrm_left', mb, (2.6, 12.8, 3.6), (-8.8, 10.35, -14.3), M['armor'], 0.3)
for i in range(7):
    box('mb_vrm_groove', mb, (0.12, 2.2, 0.22), (-7.47, 8.0 + i * 1.0, -14.3), M['plastic'], 0.0, rot=(math.radians(-30), 0, 0))
# top VRM heatsink with a printed bar
box('mb_vrm_top', mb, (2.4, 2.7, 9.3), (-8.9, 17.8, -7.55), M['armor'], 0.3)
box('mb_vrm_top_fin', mb, (0.6, 0.5, 9.0), (-7.6, 18.6, -7.55), M['armor_light'], 0.1)
box('mb_vrm_print', mb, (0.08, 0.35, 2.2), (-7.66, 17.5, -7.55), M['accent'], 0.0)
# 2x 8-pin CPU power
for z in (-15.4, -13.3):
    box('mb_8pin', mb, (1.6, 1.4, 1.8), (-9.1, 18.4, z), M['plastic'], 0.08)
# chokes / power stages along the top and left of the socket
for i in range(9):
    cyl('mb_choke', mb, 0.36, 0.9, (-9.45, 15.4, -11.4 + i * 1.0), 'x', M['nickel'], 16)
for i in range(7):
    cyl('mb_choke', mb, 0.36, 0.9, (-9.45, 14.3 - i * 1.1, -11.9), 'x', M['nickel'], 16)
# cooler mounting holes around the socket
for dy in (-4.6, 4.6):
    for dz in (-3.9, 3.9):
        cyl('mb_cooler_mount', mb, 0.42, 0.3, (-9.8, 10.35 + dy, -7.2 + dz), 'x', M['nickel'], 16)
# DIMM slots (black) with latches
for z in (-1.7, -0.8, 0.1, 1.0):
    box('mb_dimm_slot', mb, (0.9, 13.6, 0.55), (-9.5, 9.9, z), M['plastic'], 0.05)
    box('mb_dimm_latch', mb, (1.3, 0.5, 0.6), (-9.2, 16.9, z), M['plastic'], 0.08)
    box('mb_dimm_latch', mb, (1.3, 0.5, 0.6), (-9.2, 2.9, z), M['plastic'], 0.08)
# 24-pin + debug LEDs
box('mb_24pin', mb, (1.8, 5.2, 1.4), (-9.0, 9.4, 3.2), M['plastic'], 0.1)
for i in range(4):
    box('mb_debug_led', mb, (0.15, 0.22, 0.4), (-9.85, 12.6 + i * 0.5, 2.3), M['accent'], 0.0)
# PCIe x16 (steel armour) + two more x16 slots
box('mb_pcie_x16', mb, (1.2, 1.0, 9.0), (-9.35, 1.05, -10.9), M['nickel'], 0.1)
box('mb_pcie_latch', mb, (1.2, 1.0, 0.8), (-9.3, 1.05, -5.9), M['plastic'], 0.08)
box('mb_pcie_x16_b', mb, (1.1, 0.9, 9.0), (-9.4, -4.75, -10.9), M['plastic'], 0.08)
box('mb_pcie_x16_c', mb, (1.1, 0.9, 9.0), (-9.4, -9.3, -10.9), M['plastic'], 0.08)
# stacked M.2 plates under the GPU slot
box('mb_m2_23', mb, (0.8, 3.3, 9.5), (-9.5, -1.75, -8.9), M['armor'], 0.25)
box('mb_m2_4', mb, (0.8, 1.8, 9.5), (-9.5, -6.7, -8.9), M['armor'], 0.25)
for z in (-12.6, -12.1):
    cyl('mb_m2_dot', mb, 0.12, 0.1, (-9.06, -6.7, z), 'x', M['plastic'], 12)
box('mb_m2_print', mb, (0.06, 0.12, 4.0), (-9.07, -2.9, -6.5), M['accent'], 0.0)
# chipset + M.2 block (tall, bottom right) with emblem and grille
box('mb_chipset', mb, (1.0, 9.8, 6.6), (-9.5, -3.4, -0.85), M['armor'], 0.3)
box('mb_chipset_top', mb, (1.1, 1.6, 6.4), (-9.45, 0.9, -0.85), M['armor_light'], 0.2)
chevron(mb, -8.98, -3.0, -0.85, 2.4, M['accent'])
for i in range(2):
    for j in range(4):
        cyl('mb_chip_dot', mb, 0.13, 0.1, (-8.98, -7.0 + i * 0.45, -2.0 + j * 0.45), 'x', M['plastic'], 12)
# audio section: gold caps + codec cover
for i in range(4):
    cyl('mb_audio_cap', mb, 0.42, 0.9, (-9.4, -2.4 - i * 1.0, -19.2), 'x', M['gold'], 20)
box('mb_audio_cover', mb, (0.6, 2.6, 2.4), (-9.65, -7.6, -18.4), M['armor'], 0.2)
# SATA ports on the right edge
for i in range(4):
    box('mb_sata', mb, (1.0, 0.9, 1.3), (-9.4, 0.3 - i * 1.15, 3.3), M['plastic'], 0.06)
# bottom header row + front-panel header
for i in range(9):
    box('mb_header', mb, (0.7, 0.6, 1.2 if i % 3 else 1.8), (-9.6, -10.3, -18.8 + i * 2.4), M['plastic'] if i % 4 else M['white'], 0.04)
box('mb_fp_pins', mb, (0.45, 0.45, 1.6), (-9.2, -10.3, 1.6), M['gold'], 0.0)
# top-right fan headers
for z in (-1.4, 1.4):
    box('mb_fan_header', mb, (0.6, 0.6, 1.0), (-9.6, 19.0, z), M['white'], 0.05)
cyl('mb_cmos', mb, 0.95, 0.35, (-9.75, -8.2, -14.0), 'x', M['nickel'])
# mounting screws (ATX positions)
for y, z in [(18.8, -19.9), (18.8, -6.6), (18.8, 3.2), (4.0, -19.9), (4.0, 3.2), (-10.4, -19.9), (-10.4, -6.6), (-10.4, 3.2)]:
    cyl('mb_screw', mb, 0.32, 0.25, (-9.85, y, z), 'x', M['nickel'], 16)
# small SMD parts
import random
random.seed(4)
zones = [(12.5, 16.5, -11.0, -3.5), (3.2, 6.5, -11.5, -3.0), (13.0, 18.5, 1.6, 3.6), (-10.5, -8.2, -16.5, -2.5), (-9.0, -5.5, -16.5, -14.0), (-0.6, 0.6, -15.5, -6.5)]
for i in range(70):
    zy0, zy1, zz0, zz1 = random.choice(zones)
    w = random.choice([(0.5, 0.3), (0.3, 0.6), (0.8, 0.8), (0.4, 0.4), (1.1, 0.6)])
    box('mb_smd', mb, (0.18, w[0], w[1]), (-9.86, random.uniform(zy0, zy1), random.uniform(zz0, zz1)),
        M['plastic'] if i % 3 else M['gunmetal'], 0.0)

# ================================================================ CPU (under the cooler)
cpu = part('cpu')
box('cpu_socket', cpu, (0.6, 7.4, 7.4), (-9.75, 12, -12.5), M['gunmetal'], 0.15)
box('cpu_ihs', cpu, (0.45, 4.6, 4.6), (-9.3, 12, -12.5), M['nickel'], 0.25)
box('cpu_mark', cpu, (0.1, 0.25, 4.6), (-9.1, 9.3, -12.5), M['violet'], 0.04)

# ================================================================ COOLER (single-tower digital air cooler, user reference 2026-11-22)
# Seated on the CPU (socket y 10.35, z -7.2). The tower rises from the board toward the glass (+x):
# base + sprung bracket, 4 heatpipes, 32 black fins (plates parallel to the board), top cover with a
# temp/RPM display facing the glass, 120 mm ARGB fan on the front face blowing toward the rear fan.
cooler = part('cooler')
SY, SZ = 10.35, -7.2
FIN_X0, FIN_N, FIN_STEP = -7.8, 32, 0.4
FIN_X1 = FIN_X0 + (FIN_N - 1) * FIN_STEP
box('cooler_base', cooler, (0.9, 4.4, 4.4), (-8.95, SY, SZ), M['nickel'], 0.2)
box('cooler_bracket', cooler, (0.35, 9.6, 1.2), (-9.25, SY, SZ), M['gunmetal'], 0.12)
for dy in (-4.4, 4.4):
    cyl('cooler_spring', cooler, 0.35, 0.9, (-9.0, SY + dy, SZ), 'x', M['nickel'], 16)
    cyl('cooler_screw', cooler, 0.45, 0.3, (-8.45, SY + dy, SZ), 'x', M['gunmetal'], 20, 0.06)
for i, dy in enumerate((-2.7, -0.9, 0.9, 2.7)):
    cyl('cooler_pipe', cooler, 0.34, FIN_X1 - FIN_X0 + 2.2, ((FIN_X0 + FIN_X1) / 2 - 0.9, SY + dy, SZ + (0.6 if i % 2 else -0.6)), 'x', M['nickel'], 16)
fins = box('cooler_fins', cooler, (0.14, 12.4, 5.0), (FIN_X0, SY, SZ), M['fin_black'], 0.02, 1)
arr = fins.modifiers.new('array', 'ARRAY')
arr.count = FIN_N
arr.use_relative_offset = False
arr.use_constant_offset = True
arr.constant_offset_displace = (FIN_STEP * MIRROR_X, 0, 0)
bpy.context.view_layer.objects.active = fins
bpy.ops.object.modifier_move_to_index(modifier='array', index=0)
# top cover + display (faces the glass) + ARGB edge strip
TOP_X = FIN_X1 + 0.55
box('cooler_top', cooler, (0.8, 12.8, 5.4), (TOP_X, SY, SZ), M['armor'], 0.3)
bpy.ops.mesh.primitive_plane_add(size=1, location=V(TOP_X + 0.42, SY, SZ), rotation=(0, math.radians(-90 * MIRROR_X), 0))
disp = bpy.context.object
disp.name = 'cooler_display'
disp.scale = (12.2, 4.8, 1)
bpy.ops.object.transform_apply(scale=True)
finish(disp, cooler, M['cooler_display'], smooth=False)
box('cooler_argb_strip', cooler, (0.5, 12.4, 0.16), (TOP_X - 0.1, SY, SZ + 2.72), M['argb'], 0.05)
# 120 mm ARGB fan on the front face (blows toward the rear exhaust)
FAN_X = (FIN_X0 + FIN_X1) / 2 + 0.3
FAN_Z = SZ + 2.5 + 1.3
fan('cooler_fan', cooler, 12, (FAN_X, SY, FAN_Z), 'z', M['argb'], hub_ring=M['argb'])
# wire fan clips
for dx in (-5.6, 5.6):
    box('cooler_clip', cooler, (0.08, 13.0, 0.08), (FAN_X + dx, SY, FAN_Z + 1.35), M['nickel'], 0.0)
    for dy in (-6.5, 6.5):
        box('cooler_clip_end', cooler, (0.08, 0.08, 3.0), (FAN_X + dx, SY + dy, FAN_Z - 0.2), M['nickel'], 0.0)

# ================================================================ RAM (2 sticks, RGB)
ram = part('ram')
for z in (-7.4, -5.6):
    box('ram_body', ram, (3.6, 13.3, 0.75), (-8.0, 12, z), M['gunmetal'], 0.12)
    box('ram_fin', ram, (0.9, 13.3, 0.8), (-6.1, 12, z), M['alu_dark'], 0.2)
    box('ram_light', ram, (0.7, 12.8, 0.55), (-5.35, 12, z), M['argb_flow'], 0.2)  # RGB diffuser, same smooth flow as the fans

# ================================================================ GPU (triple fan)
gpu = part('gpu')
box('gpu_pcb', gpu, (11.6, 0.18, 28), (-3.9, -2.4, -6), M['pcb'], 0.05)
box('gpu_backplate', gpu, (12, 0.35, 29), (-3.8, -1.95, -6), M['gunmetal'], 0.15)
box('gpu_backplate_cut', gpu, (5, 0.1, 9), (-2, -1.75, 2), M['alu_dark'], 0.3)
gfin = box('gpu_fins', gpu, (11.2, 2.6, 0.12), (-3.9, -4.0, -19.4), M['alu'], 0.0)
garr = gfin.modifiers.new('array', 'ARRAY')
garr.use_relative_offset = False
garr.use_constant_offset = True
garr.count = 78
garr.constant_offset_displace = (0, -0.345, 0)  # Blender -y = site +z
box('gpu_shroud_side', gpu, (0.6, 1.7, 29.2), (2.2, -5.7, -6), M['gunmetal'], 0.25)
box('gpu_shroud_rail', gpu, (0.5, 0.5, 29.2), (2.15, -2.55, -6), M['alu_dark'], 0.15)
for i in range(4):
    box('gpu_facet', gpu, (0.3, 1.2, 3.2), (2.5, -5.4, -17 + i * 7.4), M['alu_dark'], 0.25)
for i in range(9):
    box('gpu_bp_vent', gpu, (6.5, 0.1, 0.45), (-4.5, -1.75, -17 + i * 1.1), M['plastic'], 0.05)
box('gpu_shroud_bottom', gpu, (12.4, 0.6, 29.4), (-3.8, -6.6, -6), M['alu_dark'], 0.3)
box('gpu_shroud_end', gpu, (12.4, 4.6, 0.8), (-3.8, -4.2, 8.6), M['gunmetal'], 0.3)
box('gpu_glow', gpu, (0.12, 0.35, 21), (2.55, -2.9, -7), M['violet'], 0.04)
box('gpu_bracket', gpu, (12.4, 4.8, 0.3), (-3.8, -4.0, -21.0), M['nickel'], 0.05)
# 12VHPWR socket on the edge that faces the glass (world y ~0.9 after the +3 lift)
box('gpu_power', gpu, (0.9, 1.0, 2.7), (2.95, -2.1, 6.9), M['plastic'], 0.08)
box('gpu_power_latch', gpu, (0.5, 0.25, 0.9), (3.2, -1.5, 6.9), M['plastic'], 0.05)
for z in (-16.4, -6.3, 3.8):
    fan(f'gpu_fan_{int(z)}', gpu, 9, (-3.8, -7.3, z), 'y', M['blue'], 11)
# brand text on the side that faces the glass
bpy.ops.object.text_add(location=V(2.56, -4.6, 1.5))
txt = bpy.context.object
txt.data.body = 'RESPECZ'
txt.data.size = 1.3
txt.data.extrude = 0.03
txt.data.align_x = 'CENTER'
txt.rotation_euler = (math.radians(90), 0, math.radians(90 * MIRROR_X))
bpy.ops.object.convert(target='MESH')
finish(bpy.context.object, gpu, M['white']).name = 'gpu_brand'

# ================================================================ SSD (the long M.2 plate above the PCIe x16)
ssd = part('ssd')
box('ssd_heatsink', ssd, (1.0, 2.0, 13.0), (-9.4, 2.75, -11.0), M['armor'], 0.3)
box('ssd_heatsink_top', ssd, (0.25, 1.7, 12.6), (-8.85, 2.75, -11.0), M['armor_light'], 0.15)
box('ssd_print', ssd, (0.06, 0.28, 5.0), (-8.7, 2.75, -9.2), M['accent'], 0.0)
box('ssd_arrow', ssd, (0.06, 0.5, 0.35), (-8.7, 2.75, -16.6), M['accent'], 0.0)
for j in range(3):
    cyl('ssd_dot', ssd, 0.12, 0.1, (-8.7, 2.75, -6.6 + j * 0.42), 'x', M['plastic'], 12)

# ================================================================ PSU (rear of the basement) + cables
psu = part('psu')
box('psu_body', psu, (15, 8.0, 14), (-2.6, -18.1, -14.0), M['alu_dark'], 0.4)
box('psu_side_label', psu, (0.12, 5.6, 9.5), (4.95, -17.9, -14.0), M['label'], 0.1)
box('psu_side_glow', psu, (0.1, 0.25, 9.5), (5.0, -15.0, -14.0), M['blue'], 0.04)
box('psu_modular', psu, (12, 6, 0.4), (-2.6, -17.9, -6.8), M['plastic'], 0.1)
def bundle(name, parent, points, cols, rows, gap, col_dir, row_dir, radius=0.2, combs=()):
    for c in range(cols):
        for r in range(rows):
            oc = (c - (cols - 1) / 2) * gap
            orow = (r - (rows - 1) / 2) * gap
            pts = [tuple(p[k] + col_dir[k] * oc + row_dir[k] * orow for k in range(3)) for p in points]
            cable(f'{name}_{c}_{r}', parent, pts, radius)
    for i, (pos, size) in enumerate(combs):
        box(f'{name}_comb_{i}', parent, size, pos, M['plastic'], 0.08)


# 24-pin: a flat 2 x 12 ribbon leaves the connector toward the glass, turns 90 deg to the front and
# dives into the grommet; two combs keep it straight.
bundle('cable_24pin', psu, [(-8.2, 9.4, 3.3), (-6.7, 9.4, 3.5), (-6.4, 9.4, 4.6), (-6.9, 9.4, 6.0), (-9.6, 9.4, 6.5)],
       12, 2, 0.42, (0, 1, 0), (1, 0, 0), 0.19,
       combs=[((-6.4, 9.4, 4.6), (1.3, 5.6, 0.35)), ((-7.6, 9.4, 6.3), (0.35, 5.6, 1.2))])
box('cable_24pin_plug', psu, (2.2, 5.4, 1.2), (-8.1, 9.4, 3.3), M['plastic'], 0.1)
# GPU power (12VHPWR, like the user's reference): a flat 2 x 6 sleeved ribbon leaves the plug on the
# card's glass-facing edge, makes a smooth U-bend and drops straight down in front of the card into the
# PSU shroud through a grommet, with one comb near the bottom.
box('cable_gpu_plug', psu, (1.0, 1.1, 2.7), (3.9, 0.9, 6.9), M['plastic'], 0.1)
bundle('cable_gpu', psu, [(4.3, 0.9, 6.9), (5.4, 1.0, 6.9), (6.2, 0.1, 6.9), (6.4, -2.0, 6.9), (6.3, -8.0, 6.9), (5.6, -12.4, 6.9), (5.2, -13.9, 6.9)],
       6, 2, 0.4, (0, 0, 1), (1, 0, 0), 0.17,
       combs=[((6.3, -8.6, 6.9), (1.3, 0.35, 2.7))])
box('case_shroud_grommet', case, (2.4, 0.22, 3.4), (5.2, -13.5, 6.9), M['plastic'], 0.4)

# CPU 8-pin: short combed bundle down from the top-rear cutout
bundle('cable_cpu', psu, [(-9.6, 21.6, -16.5), (-9.2, 20.8, -15.4), (-8.6, 19.6, -14.4)], 4, 2, 0.4,
       (0, 0, 1), (1, 0, 0), 0.18)


# ================================================================ extra detail
# RAM: angled top accents
for z in (-7.4, -5.6):
    box('ram_cap', ram, (0.5, 1.2, 0.85), (-5.0, 18.0, z), M['gunmetal'], 0.15)
    box('ram_cap', ram, (0.5, 1.2, 0.85), (-5.0, 6.0, z), M['gunmetal'], 0.15)

# case: front I/O on the top, glass thumbscrews, front badge, dust filter frame
cyl('case_power_btn', case, 0.75, 0.3, (3.5, 23.1, 17.5), 'y', M['gunmetal'], 32, 0.08)
bpy.ops.mesh.primitive_torus_add(major_radius=0.85, minor_radius=0.09, location=V(3.5, 23.2, 17.5), rotation=AXIS_ROT['y'])
finish(bpy.context.object, case, M['blue']).name = 'case_power_ring'
for i, x in enumerate((0.8, -1.2)):
    box('case_usb_a', case, (1.3, 0.2, 0.55), (x, 23.08, 17.5), M['plastic'], 0.05)
box('case_usb_c', case, (0.9, 0.2, 0.35), (-3.0, 23.08, 17.5), M['plastic'], 0.1)
cyl('case_audio', case, 0.22, 0.2, (-4.5, 23.08, 17.5), 'y', M['plastic'], 16)
for y in (20.3, -20.3):
    for z in (19.6, -19.6):
        cyl('case_thumbscrew', case, 0.55, 0.5, (11.25, y, z), 'x', M['nickel'], 24, 0.08)
for y, z in [(21.2, -7), (21.2, 7), (-21.2, -7), (-21.2, 7), (8, 20.6), (-8, 20.6), (8, -20.6), (-8, -20.6)]:
    cyl('case_frame_screw', case, 0.28, 0.25, (11.2, y, z), 'x', M['plastic'], 16)
box('case_filter_frame', case, (17.6, 0.25, 0.5), (0, 23.1, 16.2), M['plastic'], 0.08)
box('case_filter_frame', case, (17.6, 0.25, 0.5), (0, 23.1, -17.8), M['plastic'], 0.08)
bpy.ops.object.text_add(location=V(0, -21.2, 22.2))
badge = bpy.context.object
badge.data.body = 'RESPECZ'
badge.data.size = 1.0
badge.data.extrude = 0.05
badge.data.align_x = 'CENTER'
badge.rotation_euler = (math.radians(90), 0, 0)
bpy.ops.object.convert(target='MESH')
finish(bpy.context.object, case, M['nickel']).name = 'case_badge'

# PSU: fan grill ring on the bottom and the modular sockets with plugs
cyl('psu_fan_ring', psu, 6.0, 0.2, (-2.6, -22.15, -14.0), 'y', M['gunmetal'], 48)
for i in range(4):
    box('psu_socket', psu, (2.2, 1.4, 0.3), (-7 + i * 2.8, -16.4, -6.55), M['slot'], 0.05)

# ================================================================ move parts onto the new board layout
cpu.location = V(0, -1.65, 5.3)      # socket at y 10.35, z -7.2
ram.location = V(0, -2.1, 6.6)       # sticks in DIMM 2 and 4 (z -0.8, 1.0)
gpu.location = V(0, 3.0, 0)          # card sits in the steel PCIe x16 at y 1.05

# ================================================================ export
for o in scene.objects:
    o.select_set(False)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    export_apply=True,
    export_yup=True,
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=7,
    export_lights=False,
    export_cameras=False,
)
print('EXPORTED', OUT, len(scene.objects), 'objects')
