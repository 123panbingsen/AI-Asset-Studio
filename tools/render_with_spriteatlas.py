r"""
(无头) 用 SpriteAtlasAddon 渲染带骨骼动画的 FBX → 8 方向 sprite sheet。

用法:
  blender.exe --factory-startup -b -P tools/render_with_spriteatlas.py -- ^
    --fbx "C:\...\Great Sword Walk.fbx" --out "docs/art/spriteatlas-walk.png" ^
    --rotations 8 --frames 8 --res 160
"""
import argparse
import os
import sys

import bpy
import addon_utils
from mathutils import Vector


def parse_args():
    argv = sys.argv
    argv = argv[argv.index('--') + 1:] if '--' in argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--fbx', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--rotations', type=int, default=8)
    ap.add_argument('--frames', type=int, default=8)
    ap.add_argument('--res', type=int, default=160)
    ap.add_argument('--samples', type=int, default=8)
    return ap.parse_args(argv)


def setup_scene(args):
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


def frame_camera(cam):
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
    center = [(mn[i] + mx[i]) / 2 for i in range(3)]
    size = [mx[i] - mn[i] for i in range(3)]
    target = Vector(center)
    cam.location = Vector((center[0], -8, center[1]))
    cam.data.ortho_scale = max(size) * 1.35
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon_utils.enable('SpriteAtlasAddon', default_set=True)
    cam = setup_scene(args)

    bpy.ops.import_scene.fbx(filepath=args.fbx)
    mat = bpy.data.materials.new('neutral')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (0.62, 0.6, 0.56, 1)
    bsdf.inputs['Roughness'].default_value = 0.7
    for o in bpy.data.objects:
        if o.type == 'MESH' and not o.data.materials:
            o.data.materials.append(mat)
    arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
    print('armature:', arm.name if arm else None, 'actions:', [a.name for a in bpy.data.actions])

    act = bpy.data.actions[0]
    if arm:
        if not arm.animation_data:
            arm.animation_data_create()
        arm.animation_data.action = act

    # 限制动作帧范围，只抽 frames 帧
    orig = tuple(act.frame_range)
    step = max(1, int((orig[1] - orig[0]) / max(1, args.frames - 1)))
    act.use_frame_range = True
    act.frame_start = orig[0]
    act.frame_end = orig[0] + step * (args.frames - 1)
    scene = bpy.context.scene
    scene.frame_step = step
    scene.frame_start = int(act.frame_start)
    scene.frame_end = int(act.frame_end)
    print('action range:', act.frame_start, act.frame_end, 'step', step)

    # 插件属性
    sp = scene.mk_sprites_subject_panel_properties
    sp.obj = arm
    sp.rotations = args.rotations
    sp.obj_actions.clear()
    item = sp.obj_actions.add()
    item.action = act

    rp = scene.mk_sprites_render_panel_properties
    rp.resolution_x = args.res
    rp.resolution_y = args.res
    rp.auto_resolution = True
    rp.square_resolution = True

    frame_camera(cam)

    result = bpy.ops.mk_sprites.render_sprite_animation(
        subject_rotations=args.rotations,
        use_animations=True,
    )
    print('operator result:', result)

    ep = scene.mk_sprites_export_panel_properties
    img = ep.image
    if img:
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        img.filepath_raw = os.path.abspath(args.out)
        img.file_format = 'PNG'
        img.save()
        print('sheet size:', tuple(img.size), '->', args.out)
    else:
        print('WARN: no image returned')
    print('DONE')


if __name__ == '__main__':
    main()
