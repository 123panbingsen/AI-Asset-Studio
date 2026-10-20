"""(无头) 渲染 FBX 动画的抽帧预览：正视图，透明背景。

用法:
  blender.exe --factory-startup -b -P tools/blender_render_action.py -- ^
    --fbx "C:\\path\\anim.fbx" --out "assets/resources/anim/dodge" --frames 12 --res 160
"""
import argparse
import os
import sys

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--fbx', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--frames', type=int, default=12)
    ap.add_argument('--res', type=int, default=160)
    ap.add_argument('--samples', type=int, default=8)
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

    light('key', 'AREA', (-3, -4, 4), 500, 4)
    light('fill', 'AREA', (3, -2, 2), 200, 4)
    light('rim', 'AREA', (0, 4, 3), 300, 3)

    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def bbox():
    mn = [1e9, 1e9, 1e9]
    mx = [-1e9, -1e9, -1e9]
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            for i in range(3):
                mn[i] = min(mn[i], w[i])
                mx[i] = max(mx[i], w[i])
    return [(mn[i] + mx[i]) / 2 for i in range(3)], [mx[i] - mn[i] for i in range(3)]


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cam = setup(args)

    if args.fbx.lower().endswith(('.glb', '.gltf')):
        bpy.ops.import_scene.gltf(filepath=args.fbx)
    else:
        bpy.ops.import_scene.fbx(filepath=args.fbx)

    # 给无材质网格一个中性灰材质
    mat = bpy.data.materials.new('neutral')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (0.62, 0.6, 0.56, 1)
    bsdf.inputs['Roughness'].default_value = 0.7
    for o in bpy.data.objects:
        if o.type == 'MESH' and not o.data.materials:
            o.data.materials.append(mat)

    arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
    act = bpy.data.actions[0] if bpy.data.actions else None
    if arm and act:
        if not arm.animation_data:
            arm.animation_data_create()
        arm.animation_data.action = act

    center, size = bbox()
    print('bbox', center, size)
    target = Vector(center)
    dist = max(size) * 4 + 4
    cam.location = Vector((center[0], -dist, center[1]))
    cam.data.ortho_scale = max(size) * 1.3
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

    f0, f1 = (int(act.frame_range[0]), int(act.frame_range[1])) if act else (1, 1)
    os.makedirs(args.out, exist_ok=True)
    n = max(1, args.frames)
    frames = [f0 + round((f1 - f0) * i / max(1, n - 1)) for i in range(n)]
    for i, f in enumerate(frames):
        bpy.context.scene.frame_set(f)
        bpy.context.scene.render.filepath = os.path.join(args.out, f'{i:02d}.png')
        bpy.ops.render.render(write_still=True)
    print('DONE', args.out, 'frames', frames)


if __name__ == '__main__':
    main()
