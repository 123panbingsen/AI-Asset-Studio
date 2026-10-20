"""(无头) 检查 FBX/GLB 模型：物体、骨骼、动作、材质、贴图、包围盒。"""
import sys
import bpy

path = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)

if path.lower().endswith(('.glb', '.gltf')):
    bpy.ops.import_scene.gltf(filepath=path)
else:
    bpy.ops.import_scene.fbx(filepath=path)

print('=== OBJECTS ===')
for o in bpy.data.objects:
    info = f'{o.name} | type={o.type}'
    if o.type == 'MESH':
        info += f' | verts={len(o.data.vertices)} polys={len(o.data.polygons)}'
    if o.type == 'ARMATURE':
        info += f' | bones={len(o.data.bones)}'
    print(info)

print('=== ARMATURES ===')
for a in bpy.data.armatures:
    print('armature:', a.name, 'bones:', len(a.bones))

print('=== ACTIONS ===')
for act in bpy.data.actions:
    print('action:', act.name, '| frame_range:', tuple(act.frame_range), '| fcurves:', len(act.fcurves))

print('=== MATERIALS ===')
for m in bpy.data.materials:
    print('material:', m.name)

print('=== IMAGES ===')
for img in bpy.data.images:
    print('image:', img.name, img.size[:], '| source:', img.source)

print('=== BBOX ===')
minv = [1e9, 1e9, 1e9]
maxv = [-1e9, -1e9, -1e9]
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    for corner in o.bound_box:
        w = o.matrix_world @ __import__('mathutils').Vector(corner)
        for i in range(3):
            minv[i] = min(minv[i], w[i])
            maxv[i] = max(maxv[i], w[i])
print('min:', [round(v, 3) for v in minv])
print('max:', [round(v, 3) for v in maxv])
print('size:', [round(maxv[i] - minv[i], 3) for i in range(3)])
print('INSPECT_DONE')
