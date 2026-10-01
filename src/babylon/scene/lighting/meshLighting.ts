import {
    AbstractMesh,
    DirectionalLight,
    Material,
    Mesh,
    ShadowGenerator,
    SpotLight,
    Vector3,
} from '@babylonjs/core'
import { Settings } from '@/settings/settings'
import {
    ACTOR_STATIC_LIGHT_LIMIT,
    FILTER_ACTOR_STATIC_SHADOW_CASTERS_BY_DISTANCE,
    STATIC_LIGHT_LIMITS,
} from '@/babylon/scene/lighting/lightConfig'
import type { StaticLightSlot } from '@/babylon/scene/lighting/lightTypes'
import { getActorStaticLightLimit, getStaticLightLimit } from '@/babylon/scene/lighting/staticLighting'

export type ActorStaticShadowRangeTest = (lightPosition: Vector3, lightRangeSquared: number) => boolean

export interface MeshLightingHost {
    shadow: ShadowGenerator
    sunLight: DirectionalLight
    personalLight: SpotLight
    personalShadow: ShadowGenerator
    staticShadowGenerators: ShadowGenerator[]
    staticLightSlots: StaticLightSlot[]
    sharedLightMeshes: Set<AbstractMesh>
    actorLightMeshes: Set<AbstractMesh>
    actorStaticShadowCasters: Set<AbstractMesh>
    unfilteredActorStaticShadowCasters: Set<AbstractMesh>
    actorStaticShadowRangeTests: WeakMap<AbstractMesh, ActorStaticShadowRangeTest>
    actorMaterialWarmups: WeakMap<Material, Promise<void>>
    localPlayerLightWarmups: WeakMap<Material, Promise<void>>
    localPlayerLightWarmingMeshes: Set<AbstractMesh>
    indoor: boolean
}

export function resetMeshLighting(host: MeshLightingHost) {
    // Recreate the collections so initialization also works when Vite HMR
    // reuses a Lights singleton created before a newly added field existed.
    host.sharedLightMeshes = new Set<AbstractMesh>()
    host.actorLightMeshes = new Set<AbstractMesh>()
    host.actorStaticShadowCasters = new Set<AbstractMesh>()
    host.unfilteredActorStaticShadowCasters = new Set<AbstractMesh>()
    host.actorStaticShadowRangeTests = new WeakMap<AbstractMesh, ActorStaticShadowRangeTest>()
    host.actorMaterialWarmups = new WeakMap<Material, Promise<void>>()
    host.localPlayerLightWarmups = new WeakMap<Material, Promise<void>>()
    host.localPlayerLightWarmingMeshes = new Set<AbstractMesh>()
}

export function registerSharedLightMesh(host: MeshLightingHost, mesh: AbstractMesh) {
    ensureMaterialLightCapacity(mesh, STATIC_LIGHT_LIMITS[Settings.detailLevel.level - 1] + 2)
    host.sharedLightMeshes.add(mesh)
    updateSharedLightMesh(host, mesh)
}

export function unregisterSharedLightMesh(host: MeshLightingHost, mesh: AbstractMesh) {
    host.sharedLightMeshes.delete(mesh)
}

export function updateSharedLightMeshes(host: MeshLightingHost) {
    host.sharedLightMeshes.forEach(mesh => {
        if (mesh.isDisposed()) {
            host.sharedLightMeshes.delete(mesh)
            return
        }
        updateSharedLightMesh(host, mesh)
    })
}

export function updateSharedLightMesh(host: MeshLightingHost, mesh: AbstractMesh) {
    // Keep one immutable light layout for the whole outdoor cycle. Inactive
    // lights stay in the layout at zero intensity to avoid shader recompiles.
    const staticLights = host.staticLightSlots
        .slice(0, getStaticLightLimit(host))
        .map(slot => slot.light)
    const selectedLights: Array<DirectionalLight | SpotLight> = host.indoor
        ? [host.personalLight, ...staticLights]
        : [host.sunLight, host.personalLight, ...staticLights]
    const currentLights = mesh.lightSources

    if (sameLights(currentLights, selectedLights)) {
        return
    }
    mesh._lightSources = selectedLights
    mesh._markSubMeshesAsLightDirty()
}

export function registerActorLightMesh(host: MeshLightingHost, mesh: AbstractMesh) {
    ensureMaterialLightCapacity(mesh, ACTOR_STATIC_LIGHT_LIMIT + 1)
    host.actorLightMeshes.add(mesh)
    updateActorLightMesh(host, mesh)
}

export function unregisterActorLightMesh(host: MeshLightingHost, mesh: AbstractMesh) {
    host.actorLightMeshes.delete(mesh)
}

export function supportsParallelShaderCompilation(host: MeshLightingHost): boolean {
    return host.sunLight.getScene().getEngine().getCaps().parallelShaderCompile != null
}

export function warmActorMaterial(host: MeshLightingHost, mesh: AbstractMesh): Promise<void> {
    const material = mesh.material
    if (material == null || !supportsParallelShaderCompilation(host)) {
        return Promise.resolve()
    }

    const existingWarmup = host.actorMaterialWarmups.get(material)
    if (existingWarmup != null) {
        return existingWarmup
    }

    const warmup = compileActorLightVariants(host, mesh, material)
        .catch(error => {
            console.warn('Monster light shader warm-up failed', error)
        })
    host.actorMaterialWarmups.set(material, warmup)
    return warmup
}

export function updateActorLightMeshes(host: MeshLightingHost) {
    host.actorLightMeshes.forEach(mesh => {
        if (mesh.isDisposed()) {
            host.actorLightMeshes.delete(mesh)
            return
        }
        if (mesh.isEnabled()) {
            updateActorLightMesh(host, mesh)
        }
    })
}

export function updateActorLightMesh(host: MeshLightingHost, mesh: AbstractMesh) {
    if (host.localPlayerLightWarmingMeshes.has(mesh)) {
        return
    }
    const meshPosition = mesh.getAbsolutePosition()
    const staticLightLimit = getActorStaticLightLimit(host)
    const availableSlots = host.staticLightSlots.slice(0, getStaticLightLimit(host))
    const selectedStaticSlots = availableSlots
        .filter(slot => slot.source != null)
        .filter(slot => Vector3.DistanceSquared(slot.light.position, meshPosition) <= Math.pow(slot.light.range, 2))
        .sort((a, b) => Vector3.DistanceSquared(a.light.position, meshPosition) - Vector3.DistanceSquared(b.light.position, meshPosition))
        .slice(0, staticLightLimit)
    // Pad with inert slots so nearest-source changes preserve shader shape.
    const staticLights = [
        ...selectedStaticSlots,
        ...availableSlots.filter(slot => !selectedStaticSlots.includes(slot)),
    ].slice(0, staticLightLimit).map(slot => slot.light)
    const selectedLights: Array<DirectionalLight | SpotLight> = host.indoor
        ? [host.personalLight, ...staticLights]
        : [host.sunLight, host.personalLight, ...staticLights]
    const currentLights = mesh.lightSources

    if (sameLights(currentLights, selectedLights)) {
        return
    }
    mesh._lightSources = selectedLights
    mesh._markSubMeshesAsLightDirty()
}

export function warmLocalPlayerLightMaterial(host: MeshLightingHost, mesh: AbstractMesh): Promise<void> {
    const material = mesh.material
    if (material == null) {
        return Promise.resolve()
    }
    const existingWarmup = host.localPlayerLightWarmups.get(material)
    if (existingWarmup != null) {
        return existingWarmup
    }

    const warmup = compileActorLightVariants(host, mesh, material)
        .catch(error => {
            console.warn('Local player light shader warm-up failed', error)
        })
    host.localPlayerLightWarmups.set(material, warmup)
    return warmup
}

export async function compileActorLightVariants(host: MeshLightingHost, mesh: AbstractMesh, material: Material) {
    if (mesh.isDisposed() || mesh.material !== material) {
        return
    }

    const originalLightSources = mesh.lightSources.slice()
    ensureMaterialLightCapacity(mesh, ACTOR_STATIC_LIGHT_LIMIT + 1)
    const staticLights = host.staticLightSlots.slice(0, getActorStaticLightLimit(host)).map(slot => slot.light)
    const variants: Array<Array<DirectionalLight | SpotLight>> = [host.indoor
        ? [host.personalLight, ...staticLights]
        : [host.sunLight, host.personalLight, ...staticLights]]
    host.localPlayerLightWarmingMeshes.add(mesh)
    try {
        for (const variant of variants) {
            mesh._lightSources = variant
            mesh._markSubMeshesAsLightDirty()
            await material.forceCompilationAsync(mesh)
        }
    } finally {
        mesh._lightSources = originalLightSources
        mesh._markSubMeshesAsLightDirty()
        host.localPlayerLightWarmingMeshes.delete(mesh)
        if (host.actorLightMeshes.has(mesh) && !mesh.isDisposed()) {
            updateActorLightMesh(host, mesh)
        }
    }
}

export async function warmUpStaticLightShaderVariant(meshes: Array<Mesh | AbstractMesh>, selectedLights: Array<DirectionalLight | SpotLight>) {
    meshes.forEach(mesh => {
        mesh._lightSources = selectedLights
        mesh._markSubMeshesAsLightDirty()
    })
    await Promise.all(meshes.map(mesh => mesh.material?.forceCompilationAsync(mesh, {useInstances: true})))
}

export function addShadowCaster(host: MeshLightingHost, mesh: Mesh | AbstractMesh, castPersonalShadow: boolean = true, castStaticShadow: boolean = false, castOutdoorStaticShadow: boolean = false, filterActorStaticShadowByDistance: boolean = true, actorStaticShadowRangeTest?: ActorStaticShadowRangeTest) {
    if (!Settings.isShadowsEnabled()) {
        return
    }
    host.shadow.addShadowCaster(mesh)
    if (castPersonalShadow) {
        host.personalShadow.addShadowCaster(mesh)
    }
    if (castStaticShadow) {
        host.staticShadowGenerators.forEach(shadow => shadow.addShadowCaster(mesh))
    }
    if (castOutdoorStaticShadow) {
        const casters = filterActorStaticShadowByDistance
            ? host.actorStaticShadowCasters
            : host.unfilteredActorStaticShadowCasters
        casters.add(mesh)
        if (actorStaticShadowRangeTest != null) {
            host.actorStaticShadowRangeTests.set(mesh, actorStaticShadowRangeTest)
        }
        updateActorStaticShadowCasters(host)
    }
}

export function removeShadowCaster(host: MeshLightingHost, mesh: Mesh | AbstractMesh, castPersonalShadow: boolean = true, castStaticShadow: boolean = false, castOutdoorStaticShadow: boolean = false) {
    if (!Settings.isShadowsEnabled()) {
        return
    }
    host.shadow.removeShadowCaster(mesh)
    if (castPersonalShadow) {
        host.personalShadow.removeShadowCaster(mesh)
    }
    if (castStaticShadow) {
        host.staticShadowGenerators.forEach(shadow => shadow.removeShadowCaster(mesh))
    }
    if (castOutdoorStaticShadow) {
        host.actorStaticShadowCasters.delete(mesh)
        host.unfilteredActorStaticShadowCasters.delete(mesh)
        host.actorStaticShadowRangeTests.delete(mesh)
        host.staticLightSlots.forEach(slot => setActorStaticShadowCaster(slot, mesh, false))
    }
}

export function updateActorStaticShadowCasters(host: MeshLightingHost) {
    if (!Settings.isShadowsEnabled()) {
        return
    }
    for (const slot of host.staticLightSlots) {
        const slotCastsActorShadows = staticLightSlotCastsActorShadows(host, slot)
        if (!slotCastsActorShadows) {
            for (const mesh of host.actorStaticShadowCasters) {
                setActorStaticShadowCaster(slot, mesh, false)
            }
            for (const mesh of host.unfilteredActorStaticShadowCasters) {
                setActorStaticShadowCaster(slot, mesh, false)
            }
            continue
        }

        const lightPosition = slot.light.position
        const lightRangeSquared = slot.light.range * slot.light.range

        for (const mesh of host.actorStaticShadowCasters) {
            if (mesh.isDisposed() || !mesh.isEnabled()) {
                setActorStaticShadowCaster(slot, mesh, false)
                continue
            }
            if (!FILTER_ACTOR_STATIC_SHADOW_CASTERS_BY_DISTANCE) {
                setActorStaticShadowCaster(slot, mesh, true)
                continue
            }
            const rangeTest = host.actorStaticShadowRangeTests.get(mesh)
            let inRange: boolean
            if (rangeTest != null) {
                inRange = rangeTest(lightPosition, lightRangeSquared)
            } else {
                const meshPosition = mesh.getAbsolutePosition()
                const dx = meshPosition.x - lightPosition.x
                const dy = meshPosition.y - lightPosition.y
                const dz = meshPosition.z - lightPosition.z
                inRange = ((dx * dx) + (dy * dy) + (dz * dz)) <= lightRangeSquared
            }
            setActorStaticShadowCaster(slot, mesh, inRange)
        }

        for (const mesh of host.unfilteredActorStaticShadowCasters) {
            setActorStaticShadowCaster(slot, mesh, !mesh.isDisposed() && mesh.isEnabled())
        }
    }
}

function setActorStaticShadowCaster(slot: StaticLightSlot, mesh: AbstractMesh, enabled: boolean) {
    if (enabled === slot.actorShadowCasters.has(mesh)) {
        return
    }
    if (enabled) {
        slot.actorShadowCasters.add(mesh)
        slot.standardShadow?.addShadowCaster(mesh)
        slot.largeCampfireShadow?.addShadowCaster(mesh)
    } else {
        slot.actorShadowCasters.delete(mesh)
        slot.standardShadow?.removeShadowCaster(mesh)
        slot.largeCampfireShadow?.removeShadowCaster(mesh)
    }
}

function staticLightSlotCastsActorShadows(host: MeshLightingHost, slot: StaticLightSlot): boolean {
    return slot.shadow != null
        && slot.light.shadowEnabled
        && slot.source != null
        && slot.source.profile.castsShadows !== false
        && (!host.indoor || slot.source.profile.castsActorShadows === true)
}

export function pruneDisposedMeshReferences(host: MeshLightingHost) {
    host.sharedLightMeshes.forEach(mesh => {
        if (mesh.isDisposed()) {
            host.sharedLightMeshes.delete(mesh)
        }
    })
    host.actorLightMeshes.forEach(mesh => {
        if (mesh.isDisposed()) {
            host.actorLightMeshes.delete(mesh)
        }
    })
    host.actorStaticShadowCasters.forEach(mesh => {
        if (mesh.isDisposed()) {
            host.actorStaticShadowCasters.delete(mesh)
        }
    })
    host.unfilteredActorStaticShadowCasters.forEach(mesh => {
        if (mesh.isDisposed()) {
            host.unfilteredActorStaticShadowCasters.delete(mesh)
        }
    })
    host.staticLightSlots.forEach(slot => {
        slot.actorShadowCasters.forEach(mesh => {
            if (mesh.isDisposed()) {
                slot.actorShadowCasters.delete(mesh)
            }
        })
    })

    if (!Settings.isShadowsEnabled()) {
        return
    }
    const generators = [host.shadow, host.personalShadow, ...host.staticShadowGenerators]
    generators.forEach(generator => {
        if (generator == null || typeof generator.getShadowMap !== 'function') {
            return
        }
        const renderList = generator.getShadowMap()?.renderList
        if (renderList == null) {
            return
        }
        for (let index = renderList.length - 1; index >= 0; index--) {
            if (renderList[index].isDisposed()) {
                renderList.splice(index, 1)
            }
        }
    })
}

function ensureMaterialLightCapacity(mesh: AbstractMesh, requiredCapacity: number) {
    const material = mesh.material as (Material & {maxSimultaneousLights?: number}) | null
    if (material == null || !('maxSimultaneousLights' in material)) {
        return
    }
    if ((material.maxSimultaneousLights ?? 0) < requiredCapacity) {
        material.maxSimultaneousLights = requiredCapacity
    }
}

function sameLights(current: readonly unknown[], selected: readonly unknown[]): boolean {
    return current.length === selected.length && current.every((light, index) => light === selected[index])
}
