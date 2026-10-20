r"""
离线八方向「武将」渲染：Mixamo 骨骼 + 动作 + 程序化盔甲/武器。

- 只渲染外表面（隐藏 Beta_Joints），避免双网格穿插
- 固定正交相机、旋转模型，光照一致
- 程序化盔甲/头盔/披肩/长刀绑定到骨骼，跟随动画
- Cycles CPU（本机 EEVEE/Workbench 崩溃）

用法:
  blender.exe --factory-startup -b -P tools/render_8dir_warrior.py -- ^
    --fbx "Idle.fbx" --out "assets/resources/char/warrior8" --state idle ^
    --frames 8 --res 256 --dirs 8
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector, Euler

DIRS = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']


def parse_args():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--fbx', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--state', required=True)
    ap.add_argument('--frames', type=int, default=8)
    ap.add_argument('--res', type=int, default=256)
    ap.add_argument('--dirs', type=int, default=8)
    ap.add_argument('--samples', type=int, default=16)
    ap.add_argument('--dress', type=int, default=1)
    return ap.parse_args(argv)


def mat(name, color, metallic=0.0, rough=0.6):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    return m


def add_sphere(loc, scale, material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=1, location=loc)
    o = bpy.context.object
    o.scale = scale
    o.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return o


def add_cube(loc, scale, material, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = scale
    o.rotation_euler = Euler(rot)
    o.data.materials.append(material)
    return o


def parent_bone(obj, arm, bone):
    mw = obj.matrix_world.copy()
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone
    obj.matrix_world = mw


def bone_world(arm, name):
    b = arm.data.bones.get(name)
    if not b:
        return None
    return arm.matrix_world @ b.head_local


def args_dress_sword():
    return os.environ.get('DRESS_SWORD', '0') == '1'


def dress(arm, visible, height):
    """给素模上色（按身高分段）+ 小头盔/护肩/长刀，绑定骨骼。"""
    k = height / 1.7
    red = mat('armor_red', (0.42, 0.09, 0.07), 0.2, 0.5)
    gold = mat('armor_gold', (0.72, 0.56, 0.28), 0.6, 0.35)
    dark = mat('trousers', (0.10, 0.10, 0.12), 0.0, 0.8)
    skin = mat('skin', (0.80, 0.62, 0.48), 0.0, 0.7)

    mn, mx = bbox(visible)
    z0 = mn[2]
    h = max(1e-6, mx[2] - z0)
    cx = (mn[0] + mx[0]) / 2
    mats = [dark, gold, red, skin]
    for m in visible:
        m.data.materials.clear()
        for mt in mats:
            m.data.materials.append(mt)
        for poly in m.data.polygons:
            wp = m.matrix_world @ poly.center
            wz = wp.z
            t = (wz - z0) / h
            if t > 0.93:
                idx = 0  # hair dark
            elif t > 0.84:
                idx = 3  # face skin
            elif t > 0.44:
                idx = 2  # red robe / sleeves
            else:
                idx = 0  # dark trousers
            if 0.44 < t <= 0.52:
                idx = 1  # gold belt
            poly.material_index = idx

    parts = []
    for side in ('Left', 'Right'):
        sh = bone_world(arm, f'mixamorig:{side}Arm')
        if sh:
            pad = add_sphere(sh + Vector((0, 0, 0.02 * k)), (0.09 * k, 0.09 * k, 0.07 * k), gold)
            parts.append((pad, f'mixamorig:{side}Arm'))

    hand = bone_world(arm, 'mixamorig:RightHand')
    if hand and args_dress_sword():
        blade = add_cube(hand + Vector((0, -0.30 * k, 0.10 * k)), (0.03 * k, 0.55 * k, 0.045 * k), gold,
                         rot=(math.radians(15), 0, 0))
        parts.append((blade, 'mixamorig:RightHand'))

    for obj, bone in parts:
        parent_bone(obj, arm, bone)
    print('dressed parts:', len(parts))


def setup(args):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = False
    scene.render.film_transparent = True
    scene.render.resolution_x = args.res
    scene.render.resolution_y = args.res
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'

    def light(name, loc, energy, size):
        d = bpy.data.lights.new(name, 'AREA')
        d.energy = energy
        d.size = size
        o = bpy.data.objects.new(name, d)
        o.location = loc
        scene.collection.objects.link(o)

    light('key', (-3, -4, 4), 900, 5)
    light('fill', (3, -2, 2), 350, 5)
    light('rim', (0, 4, 3), 500, 4)

    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def bbox(objs):
    mn = [1e9, 1e9, 1e9]
    mx = [-1e9, -1e9, -1e9]
    for o in objs:
        if o.type != 'MESH' or o.hide_render:
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
    return mn, mx


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=args.fbx)

    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
    act = bpy.data.actions[0] if bpy.data.actions else None

    for m in meshes:
        if 'joint' in m.name.lower():
            m.hide_render = True
            m.hide_viewport = True
    visible = [m for m in meshes if not m.hide_render]
    mn, mx = bbox(visible)
    height = mx[2] - mn[2]

    if arm and act:
        if not arm.animation_data:
            arm.animation_data_create()
        arm.animation_data.action = act
    if arm and args.dress:
        dress(arm, visible, height)

    mn, mx = bbox(visible)
    center = Vector(((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2))
    size = [mx[i] - mn[i] for i in range(3)]
    cam = setup(args)
    dist = max(size) * 5 + 3
    cam.location = Vector((center.x, -dist, center.z))
    cam.data.ortho_scale = max(size) * 1.2
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()

    f0, f1 = (int(act.frame_range[0]), int(act.frame_range[1])) if act else (1, 1)
    n = max(1, args.frames)
    frames = [f0 + round((f1 - f0) * i / max(1, n - 1)) for i in range(n)]

    dirs = DIRS[:args.dirs] if args.dirs > 1 else ['']
    for di, d in enumerate(dirs):
        out_dir = os.path.join(args.out, args.state, d) if d else os.path.join(args.out, args.state)
        os.makedirs(out_dir, exist_ok=True)
        if arm:
            arm.delta_rotation_euler[2] = math.radians(di * 45)
        bpy.context.view_layer.update()
        for i, f in enumerate(frames):
            bpy.context.scene.frame_set(f)
            bpy.context.scene.render.filepath = os.path.join(out_dir, f'{i:02d}.png')
            bpy.ops.render.render(write_still=True)
        print('rendered', d or 'front')
    print('DONE', args.out)


if __name__ == '__main__':
    main()
