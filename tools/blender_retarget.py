"""(无头) 把 Mixamo 动画重定向到静态模型：导入动画骨架 + 模型网格，自动权重，渲染抽帧。

用法:
  blender.exe --factory-startup -b -P tools/blender_retarget.py -- ^
    --anim "C:\\...\\Crouch To Stand.fbx" ^
    --model "C:\\...\\model.fbx" ^
    --out "docs/art/retarget-test" --frames 12 --res 200
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
    ap.add_argument('--anim', required=True)
    ap.add_argument('--model', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--frames', type=int, default=12)
    ap.add_argument('--res', type=int, default=200)
    ap.add_argument('--samples', type=int, default=8)
    ap.add_argument('--state', default='anim')
    ap.add_argument('--dirs', type=int, default=1)
    return ap.parse_args(argv)


def setup(args):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = args.samples
    scene.render.film_transparent = True
    scene.render.resolution_x = args.res
    scene.render.resolution_y = args.res
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'

    def light(name, kind, loc, energy, size=3):
        d = bpy.data.lights.new(name, kind)
        d.energy = energy
        if kind == 'AREA':
            d.size = size
        o = bpy.data.objects.new(name, d)
        o.location = loc
        scene.collection.objects.link(o)

    light('key', 'AREA', (-3, -4, 4), 600, 4)
    light('fill', 'AREA', (3, -2, 2), 250, 4)
    light('rim', 'AREA', (0, 4, 3), 350, 3)

    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def obj_bbox(objs):
    mn = [1e9, 1e9, 1e9]
    mx = [-1e9, -1e9, -1e9]
    for o in objs:
        if o.type != 'MESH':
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
    cam = setup(args)

    # 1) 动画骨架
    bpy.ops.import_scene.fbx(filepath=args.anim)
    arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
    act = bpy.data.actions[0] if bpy.data.actions else None
    # 删掉 Mixamo 自带素模
    for o in list(bpy.data.objects):
        if o.type == 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)

    # 2) 目标模型
    before = set(bpy.data.objects)
    if args.model.lower().endswith(('.glb', '.gltf')):
        bpy.ops.import_scene.gltf(filepath=args.model)
    else:
        bpy.ops.import_scene.fbx(filepath=args.model)
    new_objs = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new_objs if o.type == 'MESH']
    print('target meshes:', [m.name for m in meshes])

    # 合并为一个网格
    bpy.ops.object.select_all(action='DESELECT')
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    mesh = bpy.context.view_layer.objects.active

    # 3) 对齐到骨架坐标（脚底 z=0，水平居中）
    mn, mx = obj_bbox([mesh])
    h = mx[2] - mn[2]
    mesh.location.x -= (mn[0] + mx[0]) / 2
    mesh.location.y -= (mn[1] + mx[1]) / 2
    mesh.location.z -= mn[2]
    bpy.context.view_layer.update()

    # 4) 自动权重绑定
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    print('parented with automatic weights')

    if act and arm:
        if not arm.animation_data:
            arm.animation_data_create()
        arm.animation_data.action = act

    # 5) 相机取景
    mn, mx = obj_bbox([mesh])
    center = [(mn[i] + mx[i]) / 2 for i in range(3)]
    size = [mx[i] - mn[i] for i in range(3)]
    target = Vector(center)
    cam.location = Vector((center[0], -8, center[1]))
    cam.data.ortho_scale = max(size) * 1.4
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()

    f0, f1 = (int(act.frame_range[0]), int(act.frame_range[1])) if act else (1, 1)
    n = max(1, args.frames)
    frames = [f0 + round((f1 - f0) * i / max(1, n - 1)) for i in range(n)]

    dir_list = DIRS[:args.dirs] if args.dirs > 1 else ['']
    dist = max(size) * 4 + 4
    for di, d in enumerate(dir_list):
        if args.dirs > 1:
            theta = math.radians(di * 45)
            cam.location = Vector((center[0] + dist * math.sin(theta), -dist * math.cos(theta), center[1]))
        else:
            cam.location = Vector((center[0], -dist, center[1]))
        cam.data.ortho_scale = max(size) * 1.4
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()

        out_dir = os.path.join(args.out, args.state, d) if d else os.path.join(args.out, args.state)
        os.makedirs(out_dir, exist_ok=True)
        for i, f in enumerate(frames):
            bpy.context.scene.frame_set(f)
            bpy.context.scene.render.filepath = os.path.join(out_dir, f'{i:02d}.png')
            bpy.ops.render.render(write_still=True)
        print('rendered', d or 'front')
    print('DONE', args.out, frames)


if __name__ == '__main__':
    main()
