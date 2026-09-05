# Lighting

> **Status:** approved direction, partially implemented. Outdoor sunlight and
> the personal indoor spotlight are implemented. Spatial assignment for static
> lights is approved but not implemented.

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
| Intensity | 4 |
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
illuminate nearby floor and actors. Static lights have no shadow generators in
the first version: giving every fireplace or torch a shadow map would be the
main uncontrolled rendering cost.

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
| Terrain and other shared thin-instance world meshes | Receive every active static light in the nearby rendered scene. Their material light limit is raised above four to the selected static-light quality budget, so ordinary spotlight range/cone attenuation decides the contribution for each fragment. |
| Player, monsters, NPCs and ordinary independent static meshes | Receive only their nearest relevant lights: normally at most two static lights, plus the personal light or sun when relevant. They never receive the complete scene light set. |

Thus five nearby torches may all light different parts of the terrain, while a
mob standing in one corridor evaluates only the two or three sources that can
actually reach it. A distant light never displaces a closer one merely because
it was created first.

Every visible lit static registers a client `StaticLightProfile` through the
same viewport visibility lifecycle as its rendered static object. Its light
therefore fades in when the fireplace/torch appears and fades out only when that
object leaves the viewport, is disposed or the world changes. There is no
separate range-based light hide threshold. The initial implementation uses this
ordinary static-light budget and will be tuned on representative hardware:

| Detail level | Active static lights |
| --- | ---: |
| Low | 0 |
| Medium | 4 |
| High | 6 |

The shared terrain/block materials allow this budget plus one personal indoor
light or outdoor sun. The current terrain is one forward-rendered thin-instance
mesh, so this is a deliberately measured quality budget rather than a scalable
solution for unlimited torches. A torch-dense dungeon still requires the later
terrain-chunk approach described below; only then can each terrain chunk receive
its local few lights while the whole scene contains many sources.

Static-light slots are created once but remain disabled while unused. A
fireplace never creates or disposes a Babylon light while the player moves; it
claims a reusable slot, fades its intensity in, then fades out and disables the
slot when no longer needed. The enabled shader therefore contains only the
lights currently used by the scene.

After the initial world meshes are available, the client temporarily enables
each direct-light count for the selected detail budget, then explicitly warms
that material variant. It then disables every temporary slot. Later enabling or
disabling a real fireplace reuses the cached variant rather than compiling it
while the player moves. This deliberately moves unavoidable first-use
compilation to world loading without permanently running a shader for inactive
lights.

Dynamic PBR-material warm-up is deliberately deferred for mobs and item types:
on mobile hardware the attempted broad per-material precompile caused longer
scene initialization and more runtime stalls than ordinary on-demand
compilation. The sole exception is the local player's shared Steve material,
which warms only the five indoor combinations of the personal spotlight plus
zero to four static lights. Only the shared terrain/block variants and this one
player material are warmed.

### Dynamic-object light lists

Shared ground-item thin-instance meshes use the same quality budget as terrain:
the base light plus every currently active static-light slot (0/4/6 static
lights, therefore a material limit of 1/5/7). A shared mesh cannot have a
separate light list for each item instance.

Player and monster body meshes instead receive the base light plus their four
nearest active static lights that are within the light range. Their selection is
rechecked every frame, but the Babylon mesh is marked light-dirty only when the
selected set changes. This keeps bodies predictable while avoiding the full
high-detail seven-light shader for every character and monster.

### Terrain cost and later spatial chunking

Raising `maxSimultaneousLights` for the shared terrain material allows its
fragments to see all active nearby torches, but the shader then evaluates every
such unshadowed light for the terrain draw. Range makes distant contributions
visually zero; it does not make their shader work free. This is acceptable only
up to the measured detail-level budget and must be tested in a deliberately
torch-dense dungeon.

If profiling shows that the required number of active terrain lights is too
large, the next solution is to partition terrain rendering into spatial
thin-instance chunk meshes. Each chunk then receives only lights whose range
intersects that chunk, retaining correct local illumination with a small
per-chunk material limit. This trades additional draw calls for substantially
less fragment-light work and is the scalable path for large torch-dense areas.

### Static-light shadows

> **Status:** deferred.

Static fireplace and torch shadows are currently disabled at every detail
level. The attempted one-map and prewarmed-cache approaches still caused visible
render stalls and flashes while moving between sources, so they are not an
acceptable runtime feature. The sun and the personal indoor spotlight retain
their existing shadow generators.

Static shadows may return only after a design that can prove smooth source
transitions on representative dungeon terrain. It must not add shadow render
targets or shadow light variants as a side effect of an ordinary fireplace
entering/leaving range.

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
| 2026-09-05 | Use spatially assigned static lights for fireplaces and future torches. | Approved / partially implemented | Terrain and shared ground-item meshes receive 0/4/6 static lights by quality, plus the personal light or sun. Character and monster bodies receive the base light plus four nearest in-range static lights. Terrain chunks are required before a torch-dense scene can use more local lights. |
| 2026-09-05 | Defer static-light shadows after runtime testing. | Approved / deferred | Fireplaces and future torches remain unshadowed at every detail level. The sun and personal indoor light retain shadows. |
