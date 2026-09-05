import {
    AbstractMesh,
    Color3,
    DirectionalLight,
    Material,
    Mesh,
    Scene,
    ShadowGenerator,
    SpotLight,
    TransformNode,
    Vector3,
} from '@babylonjs/core'
import { Settings } from '@/settings/settings'
import { Materials } from '@/babylon/materials'
import { MyPlayer } from '@/data/myPlayer'

export interface StaticLightProfile {
    color: Color3
    height: number
    intensity: number
    range: number
}

interface StaticLightSource {
    id: string
    position: Vector3
    profile: StaticLightProfile
    visible: boolean
}

interface StaticLightSlot {
    light: SpotLight
    shadow: ShadowGenerator | null
    source: StaticLightSource | null
    targetIntensity: number
    currentIntensity: number
}

const STATIC_LIGHT_FADE_SECONDS = 0.25
const STATIC_LIGHT_LIMITS = [4, 6, 6]
const ACTOR_STATIC_LIGHT_LIMIT = 4

export const Lights = {
    shadow: {} as ShadowGenerator,
    sunLight: {} as DirectionalLight,
    personalLight: {} as SpotLight,
    personalShadow: {} as ShadowGenerator,
    staticShadowGenerators: [] as ShadowGenerator[],
    staticLights: new Map<string, StaticLightSource>(),
    staticLightSlots: [] as StaticLightSlot[],
    sharedLightMeshes: new Set<AbstractMesh>(),
    actorLightMeshes: new Set<AbstractMesh>(),
    actorMaterialWarmups: new WeakMap<Material, Promise<void>>(),
    localPlayerLightWarmups: new WeakMap<Material, Promise<void>>(),
    localPlayerLightWarmingMeshes: new Set<AbstractMesh>(),
    staticLightShadersWarmed: false,
    staticLightShadersWarming: false,
    indoor: false,

    // glowLayer: null as GlowLayer,

    initialize(scene: Scene) {
        this.staticLights.clear()
        this.staticLightSlots = []
        this.staticShadowGenerators = []
        this.sharedLightMeshes.clear()
        this.actorLightMeshes.clear()
        this.actorMaterialWarmups = new WeakMap<Material, Promise<void>>()
        this.localPlayerLightWarmups = new WeakMap<Material, Promise<void>>()
        this.localPlayerLightWarmingMeshes.clear()
        this.staticLightShadersWarmed = false
        this.staticLightShadersWarming = false
        this.sunLight = new DirectionalLight("sunLight", new Vector3(-0.75, -0.75, 0.3), scene)
        this.sunLight.position = new Vector3(30, 30, 30);
        this.sunLight.diffuse = new Color3(1, 0.91, 0.78)
        //this.sunLight.diffuse = new Color3(0.82, 0.91, 1)

        this.personalLight = new SpotLight(
            "personalIndoorLight",
            new Vector3(0, 2.75, 0),
            new Vector3(0, -1, 0),
            Math.PI * 0.96,
            1,
            scene,
        )
        this.personalLight.diffuse = new Color3(1, 0.82, 0.58)
        this.personalLight.specular = new Color3(1, 0.82, 0.58)
        this.personalLight.intensity = 3.5
        this.personalLight.range = 18

        if (Settings.isShadowsEnabled()) {
            this.shadow = new ShadowGenerator(Settings.detailLevel.shadowQuality == 2 ? 4096 : 2048, this.sunLight, false)
            this.shadow.bias = 0.00001
            this.shadow.setDarkness(0)
            this.shadow.usePoissonSampling = true
            this.shadow.forceBackFacesOnly = true
            //this.shadow.getShadowMap().refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE

            this.personalShadow = new ShadowGenerator(Settings.detailLevel.shadowQuality == 2 ? 2048 : 1024, this.personalLight, false)
            this.personalShadow.bias = 0.005
            this.personalShadow.setDarkness(0)
            this.personalShadow.usePoissonSampling = true
            this.personalShadow.frustumEdgeFalloff = 0.3
            this.personalLight.shadowMinZ = 0.05
            this.personalLight.shadowMaxZ = 18
        }

        //this.glowLayer = new GlowLayer("hl", this.scene)
        //this.glowLayer.intensity = 0.3
        //this.glowLayer.blurKernelSize = 1

        this.sunLight.setEnabled(!this.indoor)
        this.personalLight.setEnabled(this.indoor)
        this.brightnessChanged()
    },

    configureStaticLightMaterials() {
        const staticLightLimit = STATIC_LIGHT_LIMITS[Settings.detailLevel.level - 1]
        const useStaticShadows = Settings.isDetalLevelHigh() && Settings.isShadowsEnabled()
        const maxLights = staticLightLimit + 1
        Materials.terrainMaterial!.maxSimultaneousLights = maxLights
        Materials.planeMaterial!.maxSimultaneousLights = maxLights
        Materials.blockMat1!.maxSimultaneousLights = maxLights
        Materials.blockMatAlpha1!.maxSimultaneousLights = maxLights

        for (let i = 0; i < staticLightLimit; i++) {
            const light = new SpotLight(
                `staticLightSlot_${i}`,
                new Vector3(0, -1000, 0),
                new Vector3(0, -1, 0),
                Math.PI * 0.96,
                1,
                this.sunLight.getScene(),
            )
            light.intensity = 0
            light.range = 1
            light.renderPriority = 1
            // Shadow maps only render correctly for an enabled Babylon light.
            // Exclude every ordinary scene mesh so enabling the fixed slot does
            // not automatically attach it anywhere; shared/actor lists below
            // remain the sole source of light assignment.
            light.excludeWithLayerMask = 0xffffffff
            light.shadowEnabled = useStaticShadows
            light.setEnabled(true)

            let shadow: ShadowGenerator | null = null
            if (useStaticShadows) {
                shadow = new ShadowGenerator(1024, light, false)
                shadow.bias = 0.005
                shadow.setDarkness(0)
                shadow.usePoissonSampling = true
                shadow.forceBackFacesOnly = true
                shadow.frustumEdgeFalloff = 0.3
                light.shadowMinZ = 0.05
                light.shadowMaxZ = 12
                this.staticShadowGenerators.push(shadow)
            }

            this.staticLightSlots.push({
                light,
                shadow,
                source: null,
                targetIntensity: 0,
                currentIntensity: 0,
            })
        }
    },

    registerStaticLight(id: string, position: Vector3, profile: StaticLightProfile) {
        let source = this.staticLights.get(id)
        if (source == null) {
            source = {
                id,
                position,
                profile,
                visible: true,
            }
            this.staticLights.set(id, source)
        } else {
            source.position = position
            source.profile = profile
            source.visible = true
        }
    },

    unregisterStaticLight(id: string) {
        const source = this.staticLights.get(id)
        if (source != null) {
            source.visible = false
        }
    },

    clearStaticLights() {
        this.staticLights.clear()
        this.staticLightSlots.forEach(slot => {
            slot.source = null
            slot.currentIntensity = 0
            slot.targetIntensity = 0
            slot.light.intensity = 0
        })
        this.updateSharedLightMeshes()
    },

    onFrame(timeRate: number) {
        if (this.staticLights.size === 0 || this.staticLightShadersWarming) {
            return
        }

        const playerPosition = MyPlayer.myChar?.pos
        const staticLightLimit = this.indoor ? STATIC_LIGHT_LIMITS[Settings.detailLevel.level - 1] : 0
        const candidates = Array.from(this.staticLights.values())
            .filter(source => source.visible)
            .sort((a, b) => {
                if (playerPosition == null) return 0
                return Vector3.DistanceSquared(a.position, playerPosition) - Vector3.DistanceSquared(b.position, playerPosition)
            })
        const activeSources = new Set(candidates.slice(0, staticLightLimit))

        for (const slot of this.staticLightSlots) {
            if (slot.source != null && !activeSources.has(slot.source)) {
                slot.targetIntensity = 0
            }
        }

        for (const source of activeSources) {
            if (this.staticLightSlots.some(slot => slot.source === source)) {
                continue
            }
            const emptySlot = this.staticLightSlots.find(slot => slot.source == null && slot.currentIntensity === 0)
            if (emptySlot != null) {
                this.assignStaticLightSlot(emptySlot, source)
            }
        }

        this.staticLightSlots.forEach(slot => {
            const active = slot.source != null && activeSources.has(slot.source)
            slot.targetIntensity = active ? slot.source!.profile.intensity : 0

            if (slot.source != null) {
                slot.light.position.set(
                    slot.source.position.x,
                    slot.source.position.y + slot.source.profile.height,
                    slot.source.position.z,
                )
                slot.light.range = slot.source.profile.range
                if (slot.shadow != null) {
                    slot.light.shadowMaxZ = slot.source.profile.range
                }
            }

            slot.currentIntensity = this.moveTowards(slot.currentIntensity, slot.targetIntensity, timeRate / STATIC_LIGHT_FADE_SECONDS)
            slot.light.intensity = slot.currentIntensity

            if (slot.currentIntensity === 0 && slot.targetIntensity === 0) {
                slot.source = null
            }
        })

        this.staticLights.forEach((source, id) => {
            if (!source.visible && !this.staticLightSlots.some(slot => slot.source === source)) {
                this.staticLights.delete(id)
            }
        })

        this.updateSharedLightMeshes()
        this.updateActorLightMeshes()

    },

    registerDynamicLightMesh(mesh: AbstractMesh, _positionResolver?: () => Vector3 | null) {
        this.registerSharedLightMesh(mesh)
    },

    unregisterDynamicLightMesh(mesh: AbstractMesh) {
        this.unregisterSharedLightMesh(mesh)
    },

    registerSharedLightMesh(mesh: AbstractMesh) {
        const material = mesh.material as (Material & { maxSimultaneousLights?: number }) | null
        if (material != null && 'maxSimultaneousLights' in material) {
            material.maxSimultaneousLights = STATIC_LIGHT_LIMITS[Settings.detailLevel.level - 1] + 1
        }
        this.sharedLightMeshes.add(mesh)
        this.updateSharedLightMesh(mesh)
    },

    unregisterSharedLightMesh(mesh: AbstractMesh) {
        this.sharedLightMeshes.delete(mesh)
    },

    updateSharedLightMeshes() {
        this.sharedLightMeshes.forEach(mesh => {
            if (mesh.isDisposed()) {
                this.sharedLightMeshes.delete(mesh)
                return
            }
            this.updateSharedLightMesh(mesh)
        })
    },

    updateSharedLightMesh(mesh: AbstractMesh) {
        const baseLight = this.indoor ? this.personalLight : this.sunLight
        // Keep the light topology fixed while the player is indoors. Adding or
        // removing a light source dirties the material's light defines and can
        // force an on-demand shader compile on mobile. Empty slots have zero
        // intensity, so they are visually inert until a fireplace claims them.
        const staticLights = this.indoor
            ? this.staticLightSlots.map(slot => slot.light)
            : []
        const selectedLights = baseLight.isEnabled() ? [baseLight, ...staticLights] : staticLights
        const currentLights = mesh.lightSources

        if (currentLights.length === selectedLights.length && currentLights.every((light, index) => light === selectedLights[index])) {
            return
        }
        mesh._lightSources = selectedLights
        mesh._markSubMeshesAsLightDirty()
    },

    registerActorLightMesh(mesh: AbstractMesh) {
        const material = mesh.material as (Material & { maxSimultaneousLights?: number }) | null
        if (material != null && 'maxSimultaneousLights' in material) {
            material.maxSimultaneousLights = ACTOR_STATIC_LIGHT_LIMIT + 1
        }
        this.actorLightMeshes.add(mesh)
        this.updateActorLightMesh(mesh)
    },

    unregisterActorLightMesh(mesh: AbstractMesh) {
        this.actorLightMeshes.delete(mesh)
    },

    supportsParallelShaderCompilation(): boolean {
        return this.sunLight.getScene().getEngine().getCaps().parallelShaderCompile != null
    },

    warmActorMaterial(mesh: AbstractMesh): Promise<void> {
        const material = mesh.material
        if (material == null || !this.supportsParallelShaderCompilation()) {
            return Promise.resolve()
        }

        const existingWarmup = this.actorMaterialWarmups.get(material)
        if (existingWarmup != null) {
            return existingWarmup
        }

        const warmup = material.forceCompilationAsync(mesh)
            .catch(error => {
                console.warn('Monster light shader warm-up failed', error)
            })
        this.actorMaterialWarmups.set(material, warmup)
        return warmup
    },

    updateActorLightMeshes() {
        this.actorLightMeshes.forEach(mesh => {
            if (mesh.isDisposed()) {
                this.actorLightMeshes.delete(mesh)
                return
            }
            if (mesh.isEnabled()) {
                this.updateActorLightMesh(mesh)
            }
        })
    },

    updateActorLightMesh(mesh: AbstractMesh) {
        if (this.localPlayerLightWarmingMeshes.has(mesh)) {
            return
        }
        const baseLight = this.indoor ? this.personalLight : this.sunLight
        const meshPosition = mesh.getAbsolutePosition()
        const selectedStaticSlots = this.staticLightSlots
            .filter(slot => slot.source != null && slot.currentIntensity > 0)
            .filter(slot => Vector3.DistanceSquared(slot.light.position, meshPosition) <= Math.pow(slot.light.range, 2))
            .sort((a, b) => Vector3.DistanceSquared(a.light.position, meshPosition) - Vector3.DistanceSquared(b.light.position, meshPosition))
            .slice(0, ACTOR_STATIC_LIGHT_LIMIT)
        // Pad with inert slots. The list always has four static-light entries,
        // so changing the nearest sources preserves the compiled shader shape.
        const staticLights = this.indoor
            ? [
                ...selectedStaticSlots,
                ...this.staticLightSlots.filter(slot => !selectedStaticSlots.includes(slot)),
            ].slice(0, ACTOR_STATIC_LIGHT_LIMIT).map(slot => slot.light)
            : []
        const selectedLights = baseLight.isEnabled() ? [baseLight, ...staticLights] : staticLights
        const currentLights = mesh.lightSources

        if (currentLights.length === selectedLights.length && currentLights.every((light, index) => light === selectedLights[index])) {
            return
        }
        mesh._lightSources = selectedLights
        mesh._markSubMeshesAsLightDirty()
    },

    warmLocalPlayerLightMaterial(mesh: AbstractMesh): Promise<void> {
        const material = mesh.material
        if (material == null) {
            return Promise.resolve()
        }
        const existingWarmup = this.localPlayerLightWarmups.get(material)
        if (existingWarmup != null) {
            return existingWarmup
        }

        const warmup = this.compileLocalPlayerLightVariants(mesh, material)
        this.localPlayerLightWarmups.set(material, warmup)
        return warmup
    },

    async compileLocalPlayerLightVariants(mesh: AbstractMesh, material: Material) {
        if (mesh.isDisposed() || mesh.material !== material) {
            return
        }

        const originalLightSources = mesh.lightSources.slice()
        this.localPlayerLightWarmingMeshes.add(mesh)
        try {
            mesh._lightSources = [this.personalLight, ...this.staticLightSlots.slice(0, ACTOR_STATIC_LIGHT_LIMIT).map(slot => slot.light)]
            mesh._markSubMeshesAsLightDirty()
            await material.forceCompilationAsync(mesh)
        } catch (error) {
            console.warn('Local player light shader warm-up failed', error)
        } finally {
            mesh._lightSources = originalLightSources
            mesh._markSubMeshesAsLightDirty()
            this.localPlayerLightWarmingMeshes.delete(mesh)
            if (this.actorLightMeshes.has(mesh) && !mesh.isDisposed()) {
                this.updateActorLightMesh(mesh)
            }
        }
    },

    assignStaticLightSlot(slot: StaticLightSlot, source: StaticLightSource) {
        slot.source = source
        slot.currentIntensity = 0
        slot.targetIntensity = 0
        slot.light.position.set(source.position.x, source.position.y + source.profile.height, source.position.z)
        slot.light.range = source.profile.range
        if (slot.shadow != null) {
            slot.light.shadowMaxZ = source.profile.range
        }
        slot.light.diffuse = source.profile.color
        slot.light.specular = source.profile.color
    },

    moveTowards(current: number, target: number, amount: number): number {
        if (current < target) return Math.min(current + amount * target, target)
        if (current > target) return Math.max(current - amount, target)
        return current
    },

    async warmUpStaticLightShaders(meshes: Array<Mesh | AbstractMesh>) {
        if (this.staticLightShadersWarmed || this.staticLightShadersWarming) {
            return
        }

        meshes.forEach(mesh => this.registerSharedLightMesh(mesh))
        this.staticLightShadersWarming = true
        try {
            await this.warmUpStaticLightShaderVariant(meshes, this.staticLightSlots)

            this.staticLightShadersWarmed = true
        } catch (error) {
            console.warn('Static light shader warm-up failed', error)
        } finally {
            this.updateSharedLightMeshes()
            this.staticLightShadersWarming = false
        }
    },

    async warmUpStaticLightShaderVariant(meshes: Array<Mesh | AbstractMesh>, enabledSlots: StaticLightSlot[]) {
        const baseLight = this.indoor ? this.personalLight : this.sunLight
        const selectedLights = baseLight.isEnabled() ? [baseLight, ...enabledSlots.map(slot => slot.light)] : enabledSlots.map(slot => slot.light)
        meshes.forEach(mesh => {
            mesh._lightSources = selectedLights
            mesh._markSubMeshesAsLightDirty()
        })
        await Promise.all(meshes.map(mesh => mesh.material?.forceCompilationAsync(mesh, {useInstances: true})))
    },

    attachPersonalLight(parent: TransformNode) {
        this.personalLight.parent = parent
        this.personalLight.position = new Vector3(0, 2.75, 0)
        this.personalLight.direction = new Vector3(0, -1, 0)
    },

    addShadowCaster(mesh: Mesh | AbstractMesh, castPersonalShadow: boolean = true, castStaticShadow: boolean = false) {
        if (Settings.isShadowsEnabled()) {
            Lights.shadow.addShadowCaster(mesh)
            if (castPersonalShadow) {
                Lights.personalShadow.addShadowCaster(mesh)
            }
            if (castStaticShadow) {
                Lights.staticShadowGenerators.forEach(shadow => shadow.addShadowCaster(mesh))
            }
        }
    },

    removeShadowCaster(mesh: Mesh | AbstractMesh, castPersonalShadow: boolean = true, castStaticShadow: boolean = false) {
        if (Settings.isShadowsEnabled()) {
            Lights.shadow.removeShadowCaster(mesh)
            if (castPersonalShadow) {
                Lights.personalShadow.removeShadowCaster(mesh)
            }
            if (castStaticShadow) {
                Lights.staticShadowGenerators.forEach(shadow => shadow.removeShadowCaster(mesh))
            }
        }
    },

    brightnessChanged() {
        this.sunLight.intensity = this.indoor ? 0 : 0.5 + Settings.brightness * 0.05
        const brightness = Math.min(10, Math.max(1, Settings.brightness))
        this.personalLight.intensity = 3 + ((brightness - 1) / 9)
    },

    setIndoor(indoor: boolean) {
        this.indoor = indoor
        this.sunLight.setEnabled?.(!indoor)
        this.personalLight.setEnabled?.(indoor)
        this.brightnessChanged()
        this.sunLight.getScene?.().markAllMaterialsAsDirty(Material.LightDirtyFlag)
        this.updateSharedLightMeshes()
        this.updateActorLightMeshes()
    }
}
