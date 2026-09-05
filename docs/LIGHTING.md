# Lighting

> **Status:** approved direction, partially implemented. Outdoor sunlight, the
> personal indoor spotlight and the fixed-slot static-light budget are
> implemented.

This document owns the visual-lighting rules for every world environment and
for placed light sources. Lighting is client presentation, unless a future
gameplay feature explicitly says otherwise: it does not alter server-side
visibility, movement, combat line of sight or targeting.

## Environment lighting

Every world has the required `environment.type` property. Its initial values
are `outdoor` and `indoor`.

| Environment | Sunlight | Scene atmosphere | Environment light |
| --- | --- | --- | --- |
| `outdoor` | Enabled directional sunlight. | Normal fog and weather. | Normal intensity. |
| `indoor` | Disabled. | Fog and weather disabled. | Reduced intensity, supplemented by local lights. |

The environment type is world-level presentation state. It is independent of
the shared map resource and is applied whenever the client changes world. A
world transition must therefore enable/disable lights cleanly rather than leave
the source world's lighting active.

## Outdoor sunlight

Outdoor worlds use one client-side directional sun light. It supplies the
global warm daylight direction, has the outdoor shadow generator and affects
the normal terrain, static objects, characters, monsters and equipment. Its
brightness follows the existing player brightness setting.

The current client sun points along `(-0.75, -0.75, 0.3)`, has a warm diffuse
colour and intensity `0.5 + brightness * 0.05`. When shadows are enabled its
shadow map is 2048 at normal quality and 4096 at high quality. The sun is
disabled indoors; an indoor world must not retain its directional lighting or
its outdoor fog/weather presentation.

There is no day/night cycle yet. When it is introduced, it belongs here: the
outdoor sun intensity/colour and the availability of outdoor static lights must
change together according to an explicit time-of-day design. Static lights are
not intrinsically dungeon-only.

## Personal indoor light

Indoor worlds give the local player one client-only personal `SpotLight`. It is
positioned slightly above the character, points vertically down and creates a
controlled illuminated circle around nearby walkable space. The spotlight
follows only the local player; it is not a server entity, needs no networking,
and other clients do not receive a copy.

A downward spotlight is used instead of a point light because its one shadow
map covers the useful local gameplay area. Omnidirectional point-light shadows
would require six shadow directions and are deferred.

The current implementation is:

| Property | Value |
| --- | --- |
| Local offset | 2.75 world units above the player |
| Direction / cone | Vertically downward / 96% of `PI` |
| Range | 18 |
| Intensity | 3.0–4.0, linearly following the player brightness setting (1–10) |
| Colour | Warm `(1, 0.82, 0.58)` |
| Shadow map | 1024 normal, 2048 high; only when shadows are enabled |

The personal shadow projection is limited to the same short range rather than
using the camera frustum. It includes terrain, blocking/static world objects,
trees, characters and monsters; the local player is included as a caster.
Small ground items, foliage, particles, splats and short-lived effects do not
cast into it without a measured visual reason.

The personal light is independent of the static-light budget below. It remains
the only indoor light with a shadow generator in the initial design.

## Static lights: fireplaces, torches and future sources

Placed light sources are visual effects of existing static-object types. The
server remains authoritative for a fireplace, torch or equivalent object and
its location, but does not create, synchronize or persist a Babylon light.
The client maps each lit static type to a `StaticLightProfile` containing its
local offset, spot direction, warm colour, cone, range and target intensity.

The first profiles are the small and large fireplaces. Wall torches will use
the identical system, and the same profiles may later run outdoors at night.
They use a wide downward spotlight style, placed above the fire or flame to
illuminate nearby floor and actors. They are unshadowed on low and medium;
high detail experimentally gives every static slot a small shadow map.

### Spatial assignment

An indoor scene may need more than four visible fireplaces and torches. The
current world terrain is rendered through shared thin-instance meshes, so a
single global four-light material limit would be incorrect: Babylon selects the
first lights associated with that mesh, not the lights nearest to each terrain
fragment. A near torch could therefore be omitted while a distant torch is
selected before its range attenuation is evaluated.

Static lights are consequently split into two consumers with different rules:

| Consumer | Assignment rule |
| --- | --- |
| Terrain and other shared thin-instance world meshes | Receive the complete fixed static-slot budget. Their material light limit is raised above four to the selected static-light quality budget, so ordinary spotlight range/cone attenuation decides the contribution for each fragment. |
| Player, monsters, NPCs and ordinary independent static meshes | Receive four fixed static-light entries plus the personal light or sun. The entries are filled with the nearest in-range sources and inert slots as necessary. |

Thus six nearby torches may all light different parts of the terrain, while a
body mesh evaluates at most four static sources. A distant light never
displaces a closer one merely because it was created first.

Every visible lit static registers a client `StaticLightProfile` through the
same viewport visibility lifecycle as its rendered static object. Its light
therefore fades in when the fireplace/torch appears and fades out only when that
object leaves the viewport, is disposed or the world changes. There is no
separate range-based light hide threshold. The initial implementation uses this
ordinary static-light budget and will be tuned on representative hardware:

| Detail level | Active static lights |
| --- | ---: |
| Low | 4 |
| Medium | 6 |
| High | 6 |

The shared terrain/block materials allow this budget plus one personal indoor
light or outdoor sun. The current terrain is one forward-rendered thin-instance
mesh, so this is a deliberately measured quality budget rather than a scalable
solution for unlimited torches. A torch-dense dungeon still requires the later
terrain-chunk approach described below; only then can each terrain chunk receive
its local few lights while the whole scene contains many sources.

Static-light slots are created once and never enter or leave a mesh's light
list while the player moves. Babylon's global light remains disabled, avoiding
a scene-wide light resynchronisation; each affected mesh owns its fixed local
list of slot lights. An unused slot has intensity zero. A fireplace only claims
a slot and fades its intensity up or down, which updates uniforms without
changing shader defines.

After the initial world meshes are available, the client warms the single
full-budget material variant for the selected detail level. It deliberately
uses the same fixed list that gameplay uses: base light plus 4/6/6 static
slots for shared meshes, and base light plus four static entries for bodies.

Dynamic PBR-material warm-up is deliberately deferred for mobs and item types:
on mobile hardware the attempted broad per-material precompile caused longer
scene initialization and more runtime stalls than ordinary on-demand
compilation. The local player's shared Steve material warms its one stable
indoor variant: personal spotlight plus four static entries. For a monster's
first appearance, browsers that expose `KHR_parallel_shader_compile` keep its
new skinned clone hidden while the exact body variant is compiled
asynchronously; it becomes visible only after completion. Browsers without the
extension retain ordinary immediate monster presentation. Only the shared
terrain/block variant, the Steve material and requested monster body materials
are warmed.

### Dynamic-object light lists

Shared ground-item thin-instance meshes use the same fixed quality budget as
terrain: the base light plus all 4/6/6 static slots (therefore a material limit
of 1/5/7). A shared mesh cannot have a separate light list for each item
instance.

Player and monster body meshes receive the base light plus four fixed static
entries. The nearest in-range sources fill these positions, and any remaining
positions contain zero-intensity slots. Their source selection may be refreshed
without changing the five-light shader shape, while avoiding the full
high-detail seven-light shader for every character and monster.

### Terrain cost and later spatial chunking

Raising `maxSimultaneousLights` for the shared terrain material allows its
fragments to see all active nearby torches, but the shader then evaluates every
such light for the terrain draw. Range makes distant contributions visually
zero; it does not make their shader work free. This is acceptable only up to
the measured detail-level budget and must be tested in a deliberately
torch-dense dungeon.

If profiling shows that the required number of active terrain lights is too
large, the next solution is to partition terrain rendering into spatial
thin-instance chunk meshes. Each chunk then receives only lights whose range
intersects that chunk, retaining correct local illumination with a small
per-chunk material limit. This trades additional draw calls for substantially
less fragment-light work and is the scalable path for large torch-dense areas.

### Static-light shadows

> **Status:** approved / implemented.

High detail creates one 1024px shadow map for every fixed static-light slot.
Only terrain, generated world blocks, trees and static-object prefabs are
casters; characters, monsters, equipment, ground items, foliage and particles
do not cast into static-light maps. Low and medium keep static lights
unshadowed. The Babylon lights remain enabled solely so their shadow maps can
render, but an exclusion layer mask prevents Babylon from assigning them to
ordinary scene meshes. They affect only the client's explicit fixed light
lists, so movement does not cause a scene-wide light resynchronisation.

## Material and scene invariants

Client materials and active-mesh lists must not be frozen as a lighting
optimization. Worlds add and remove lights dynamically, so materials must be
able to react to environment and light changes without an explicit
unfreeze/rebuild transition.

Monster and player-body GLTF source materials are `doubleSided`. Their runtime
PBR materials preserve this via `twoSidedLighting = true` and use
`usePhysicalLightFalloff = false`, so local lights remain visible on body
surfaces as well as equipment.

## Decision log

| Date | Decision | Status | Notes |
| --- | --- | --- | --- |
| 2026-09-04 | Give worlds an indoor/outdoor environment type. | Approved / implemented | `indoor` disables outdoor sunlight, fog and weather and reduces environment light; `outdoor` retains normal daylight. |
| 2026-09-04 | Use one directional sun for outdoor world lighting. | Approved / implemented | It provides daylight and the outdoor shadow map; indoor worlds disable it. |
| 2026-09-04 | Use a local downward spotlight as the initial personal indoor light. | Approved / implemented | One short-range shadow map is preferable to point-light cubemap shadows. |
| 2026-09-04 | Do not freeze client materials or active-mesh lists for lighting. | Approved / implemented | Dynamic world lights must affect terrain, entities and equipment immediately. |
| 2026-09-05 | Use spatially assigned static lights for fireplaces and future torches. | Approved / partially implemented | Terrain and shared ground-item meshes receive the fixed 4/6/6-slot quality budget, plus the personal light or sun. Character and monster bodies receive four fixed entries populated by the nearest in-range sources. Terrain chunks are required before a torch-dense scene can use more local lights. |
| 2026-09-05 | Keep static-light shader topology fixed while moving. | Approved / implemented | Slots remain in each local mesh light list with zero intensity while unused; a fireplace updates uniforms only. This avoids first-use shader recompilation stalls on mobile. |
| 2026-09-05 | Prepare a newly visible monster asynchronously instead of prewarming every world mob. | Approved / implemented | With `KHR_parallel_shader_compile`, the first skinned clone remains hidden until its material is ready, then may pop in. A tiny creation/upload cost remains acceptable; eager per-world mob warm-up is deferred. |
| 2026-09-05 | Set final fixed-slot static-light quality budgets. | Approved / implemented | Low uses 4 unshadowed slots; medium uses 6 unshadowed slots; high uses 6 slots with six 1024px shadow maps. A layer mask prevents automatic mesh assignment. |
| 2026-09-05 | Let the personal indoor spotlight follow player brightness. | Approved / implemented | Brightness 1–10 maps linearly to spotlight intensity 3.0–4.0. Static fireplace and torch profiles remain fixed. |
