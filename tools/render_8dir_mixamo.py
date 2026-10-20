r"""
离线八方向渲染：带骨骼的 Mixamo FBX + 动作 → 8 方向 × N 帧透明 PNG。

修正点：
- 只渲染外表面网格（隐藏 Beta_Joints 等内部网格），避免双网格穿插
- 固定正交相机与取景（按绑定姿态包围盒），旋转模型而非相机，光照一致
- Cycles CPU（本机 EEVEE/Workbench 会崩）

用法:
  blender.exe --factory-startup -b -P tools/render_8dir_mixamo.py -- ^
    --fbx "Idle.fbx" --out "assets/resources/char/mixamo8" --state idle ^
    --frames 8 --res 256 --dirs 8 --samples 16
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

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
    return ap.parse_args(argv)


def setup(args):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = False
    scene.render.film_transparent = True
    scene.render.resolution_x = args.res
    scene.render.resolution_y = args.res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'

    def light(name, loc, energy, size=4.0):
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
    print('meshes:', [m.name for m in meshes], 'armature:', arm.name if arm else None)

    # 只保留外表面网格：隐藏名字带 Joint 的网格
    for m in meshes:
        if 'joint' in m.name.lower():
            m.hide_render = True
            m.hide_viewport = True
            print('hidden inner mesh:', m.name)
    visible = [m for m in meshes if not m.hide_render]

    # 没有材质时给中性色
    mat = bpy.data.materials.new('neutral')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (0.62, 0.55, 0.48, 1)
    bsdf.inputs['Roughness'].default_value = 0.7
    for m in visible:
        if not m.data.materials:
            m.data.materials.append(mat)

    if arm and act:
        if not arm.animation_data:
            arm.animation_data_create()
        arm.animation_data.action = act

    # 绑定姿态取景（固定）
    mn, mx = bbox(visible)
    center = Vector(((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2))
    size = [mx[i] - mn[i] for i in range(3)]
    ortho = max(size) * 1.18
    cam = setup(args)
    dist = max(size) * 5 + 3
    cam.location = Vector((center.x, -dist, center.z))
    cam.data.ortho_scale = ortho
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    print('bbox size', [round(v, 3) for v in size], 'ortho', round(ortho, 3))

    f0, f1 = (int(act.frame_range[0]), int(act.frame_range[1])) if act else (1, 1)
    n = max(1, args.frames)
    frames = [f0 + round((f1 - f0) * i / max(1, n - 1)) for i in range(n)]
    print('frames:', frames)

    dirs = DIRS[:args.dirs] if args.dirs > 1 else ['']
    for di, d in enumerate(dirs):
        out_dir = os.path.join(args.out, args.state, d) if d else os.path.join(args.out, args.state)
        os.makedirs(out_dir, exist_ok=True)
        if arm:
            # 旋转模型（不是相机），光照与取景保持相对一致
            arm.delta_rotation_euler[2] = math.radians(di * 45)
        bpy.context.view_layer.update()
        for i, f in enumerate(frames):
            bpy.context.scene.frame_set(f)
            bpy.context.scene.render.filepath = os.path.join(out_dir, f'{i:02d}.png')
            bpy.ops.render.render(write_still=True)
        print('rendered', d or 'front', '->', out_dir)
    if arm:
        arm.delta_rotation_euler[2] = 0
    print('DONE', args.out)


if __name__ == '__main__':
    main()
