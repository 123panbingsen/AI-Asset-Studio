r"""
blender_render_8dir.py — Blender 无头脚本：生成/渲染角色八方向行走帧。

用法（在项目根）:
  blender.exe -b -P tools/blender_render_8dir.py -- ^
      --out "C:\Users\Administrator\EclipsedBlade\assets\resources\char\blenderchibi" ^
      --id blenderchibi --res 160 --samples 8

可选:
  --model <file.glb|fbx>  导入现成模型（暂只渲染静态 8 角度）
  --dirs 8                方向数（默认 8）
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
    ap.add_argument('--out', required=True)
    ap.add_argument('--id', default='blenderchibi')
    ap.add_argument('--res', type=int, default=160)
    ap.add_argument('--samples', type=int, default=8)
    ap.add_argument('--model', default='')
    ap.add_argument('--engine', default='workbench', choices=['workbench', 'cycles', 'eevee'])
    return ap.parse_args(argv)


def make_mat(name, color, metallic=0.0, rough=0.6):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = rough
    return m


def sphere(name, loc, scale, material, seg=20, ring=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, radius=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    o.data.materials.append(material)
    bpy.ops.object.shade_smooth()
    return o


def empty(name, loc):
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=loc)
    e = bpy.context.object
    e.name = name
    return e


def parent_keep(child, parent):
    mw = child.matrix_world.copy()
    child.parent = parent
    child.matrix_world = mw


def build_chibi():
    skin = make_mat('skin', (0.86, 0.70, 0.52), 0, 0.7)
    hair = make_mat('hair', (0.10, 0.08, 0.07), 0, 0.8)
    armor = make_mat('armor', (0.45, 0.12, 0.08), 0.3, 0.45)
    cloth = make_mat('cloth', (0.12, 0.26, 0.20), 0, 0.8)
    gold = make_mat('gold', (0.79, 0.63, 0.35), 0.7, 0.3)

    # 头 / 头发 / 眼睛（角色朝 -Y）
    head = sphere('head', (0, 0, 2.55), (0.55, 0.50, 0.55), skin)
    hair_cap = sphere('hair', (0, 0.03, 2.62), (0.57, 0.52, 0.50), hair)
    eye_l = sphere('eye_l', (-0.18, -0.44, 2.58), (0.055, 0.04, 0.07), hair, 12, 8)
    eye_r = sphere('eye_r', (0.18, -0.44, 2.58), (0.055, 0.04, 0.07), hair, 12, 8)

    torso = sphere('torso', (0, 0, 1.75), (0.42, 0.28, 0.55), armor)
    pelvis = sphere('pelvis', (0, 0, 1.25), (0.30, 0.24, 0.26), cloth)
    belt = sphere('belt', (0, 0, 1.42), (0.36, 0.27, 0.08), gold)

    # 手臂 / 腿（用空物体做关节，便于关键帧）
    arm_l = empty('arm_l_root', (-0.52, 0, 2.05))
    arm_r = empty('arm_r_root', (0.52, 0, 2.05))
    leg_l = empty('leg_l_root', (-0.20, 0, 1.00))
    leg_r = empty('leg_r_root', (0.20, 0, 1.00))

    def limb(name, loc, scale, material, parent):
        o = sphere(name, loc, scale, material)
        parent_keep(o, parent)
        return o

    limb('arm_l', (-0.52, 0, 1.65), (0.11, 0.11, 0.42), skin, arm_l)
    limb('arm_r', (0.52, 0, 1.65), (0.11, 0.11, 0.42), skin, arm_r)
    limb('leg_l', (-0.20, 0, 0.50), (0.14, 0.14, 0.48), cloth, leg_l)
    limb('leg_r', (0.20, 0, 0.50), (0.14, 0.14, 0.48), cloth, leg_r)

    # 披风/护肩点缀
    shoulder_l = sphere('shoulder_l', (-0.45, 0, 2.05), (0.22, 0.22, 0.16), gold)
    shoulder_r = sphere('shoulder_r', (0.45, 0, 2.05), (0.22, 0.22, 0.16), gold)

    return {
        'arm_l': arm_l, 'arm_r': arm_r, 'leg_l': leg_l, 'leg_r': leg_r,
        'torso': torso, 'head': head,
    }


def animate_walk(roots, frames=8):
    """8 帧行走循环：四肢绕 X 轴摆动。"""
    for f in range(1, frames + 1):
        phase = 2 * math.pi * (f - 1) / frames
        swing = math.sin(phase)
        roots['arm_l'].rotation_euler = (swing * 0.6, 0, 0)
        roots['arm_r'].rotation_euler = (-swing * 0.6, 0, 0)
        roots['leg_l'].rotation_euler = (swing * 0.5, 0, 0)
        roots['leg_r'].rotation_euler = (-swing * 0.5, 0, 0)
        roots['torso'].location.z = 1.75 + abs(math.sin(phase)) * 0.03

        for key in ('arm_l', 'arm_r', 'leg_l', 'leg_r'):
            roots[key].keyframe_insert(data_path='rotation_euler', frame=f)
        roots['torso'].keyframe_insert(data_path='location', frame=f)


def setup_scene(args):
    scene = bpy.context.scene
    if args.engine == 'cycles':
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.samples = args.samples
    elif args.engine == 'workbench':
        scene.render.engine = 'BLENDER_WORKBENCH'
        shading = scene.display.shading
        shading.light = 'STUDIO'
        shading.color_type = 'MATERIAL'
        shading.show_shadows = True
        shading.show_cavity = True
    else:
        try:
            scene.render.engine = 'BLENDER_EEVEE_NEXT'
        except Exception:
            scene.render.engine = 'BLENDER_EEVEE'
    scene.render.film_transparent = True
    scene.render.resolution_x = args.res
    scene.render.resolution_y = args.res
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'

    # 灯光：三点光
    def light(name, kind, loc, energy, size=3.0):
        d = bpy.data.lights.new(name, kind)
        d.energy = energy
        if kind == 'AREA':
            d.size = size
        o = bpy.data.objects.new(name, d)
        o.location = loc
        scene.collection.objects.link(o)
        return o

    light('key', 'AREA', (-3, -4, 5), 600, 4)
    light('fill', 'AREA', (4, -2, 3), 250, 4)
    light('rim', 'AREA', (0, 4, 4), 400, 3)

    # 正交相机
    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 3.4
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def aim(cam, target):
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def world_bbox():
    minv = [1e9, 1e9, 1e9]
    maxv = [-1e9, -1e9, -1e9]
    from mathutils import Vector as V
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        for corner in o.bound_box:
            w = o.matrix_world @ V(corner)
            for i in range(3):
                minv[i] = min(minv[i], w[i])
                maxv[i] = max(maxv[i], w[i])
    center = [(minv[i] + maxv[i]) / 2 for i in range(3)]
    size = [maxv[i] - minv[i] for i in range(3)]
    return center, size


def render_dirs(cam, out_root, dirs, frames=8, static_only=False, target=None, ortho=None):
    if target is None:
        target = Vector((0, 0, 1.45))
    if ortho:
        cam.data.ortho_scale = ortho
    dist = 8.0
    os.makedirs(out_root, exist_ok=True)
    for i, d in enumerate(dirs):
        theta = math.radians(i * 45)
        cam.location = Vector((dist * math.sin(theta), -dist * math.cos(theta), target.z))
        aim(cam, target)
        walk_dir = os.path.join(out_root, 'walk', d)
        os.makedirs(walk_dir, exist_ok=True)
        idle_dir = os.path.join(out_root, 'idle', d)
        os.makedirs(idle_dir, exist_ok=True)

        if static_only:
            bpy.context.scene.frame_set(1)
            first = os.path.join(idle_dir, '00.png')
            bpy.context.scene.render.filepath = first
            bpy.ops.render.render(write_still=True)
            import shutil
            for k in range(1, 4):
                shutil.copyfile(first, os.path.join(idle_dir, f'{k:02d}.png'))
            for k in range(0, frames):
                shutil.copyfile(first, os.path.join(walk_dir, f'{k:02d}.png'))
        else:
            for f in range(1, frames + 1):
                bpy.context.scene.frame_set(f)
                bpy.context.scene.render.filepath = os.path.join(walk_dir, f'{f - 1:02d}.png')
                bpy.ops.render.render(write_still=True)
            bpy.context.scene.frame_set(1)
            first = os.path.join(idle_dir, '00.png')
            bpy.context.scene.render.filepath = first
            bpy.ops.render.render(write_still=True)
            import shutil
            for k in range(1, 4):
                shutil.copyfile(first, os.path.join(idle_dir, f'{k:02d}.png'))
        print('rendered dir', d)


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cam = setup_scene(args)

    if args.model:
        path = args.model
        if path.lower().endswith(('.glb', '.gltf')):
            bpy.ops.import_scene.gltf(filepath=path)
        else:
            bpy.ops.import_scene.fbx(filepath=path)
        print('imported model:', path)
        center, size = world_bbox()
        target = Vector(center)
        ortho = max(size) * 1.25
        print('bbox center', center, 'size', size, 'ortho', ortho)
        render_dirs(cam, args.out, DIRS, 8, static_only=True, target=target, ortho=ortho)
    else:
        roots = build_chibi()
        animate_walk(roots, 8)
        print('built procedural chibi')
        render_dirs(cam, args.out, DIRS, 8)

    print('DONE', args.out)


if __name__ == '__main__':
    main()
