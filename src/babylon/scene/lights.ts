import {
    AbstractMesh,
    Color3,
    DirectionalLight,
    Material,
    Mesh,
    RenderTargetTexture,
    Scene,
    ShadowGenerator,
    SpotLight,
    TransformNode,
    Vector3,
} from '@babylonjs/core'
import { Settings } from '@/settings/settings'
import { Materials } from '@/babylon/materials'
import { MyPlayer } from '@/data/myPlayer'
import type { DayNightCycleSync } from '@/network/messageIfs'

export interface StaticLightProfile {
    color: Color3
    height: number
    intensity: number
    range: number
    flicker?: boolean
}

interface StaticLightSource {
    id: string
    position: Vector3
    profile: StaticLightProfile
    visible: boolean
    flickerPhase: number
}

interface StaticLightSlot {
    light: SpotLight
    shadow: ShadowGenerator | null
    source: StaticLightSource | null
    targetIntensity: number
    currentIntensity: number
    flickerOffset: Vector3
}

const STATIC_LIGHT_FADE_SECONDS = 0.25
const STATIC_LIGHT_MIN_BRIGHTNESS_FACTOR = 0.25
const STATIC_LIGHT_LIMITS = [4, 6, 6]
const OUTDOOR_STATIC_LIGHT_LIMITS = [1, 2, 2]
const ACTOR_STATIC_LIGHT_LIMIT = 4
const OUTDOOR_ACTOR_STATIC_LIGHT_LIMIT = 2
const PERSONAL_LIGHT_POSITION = new Vector3(-0.25, 2.75, -0.25)
const PERSONAL_LIGHT_DIRECTION = new Vector3(0.25, -2.75, 0.25).normalize()
const DEFAULT_DAY_NIGHT_CYCLE_DURATION_MS = 120 * 60 * 1000
const SUNRISE_END_PHASE = 1 / 12
const SUNSET_START_PHASE = 1 / 2
const SUNSET_END_PHASE = 7 / 12
const NIGHT_SUN_INTENSITY_FACTOR = 0
const NIGHT_ENVIRONMENT_INTENSITY_FACTOR = 0.075
const OUTDOOR_PERSONAL_LIGHT_FACTOR = 0.75
const OUTDOOR_STATIC_LIGHT_INTENSITY_FACTOR = 1.4
const OUTDOOR_STATIC_LIGHT_RANGE_FACTOR = 1.5
const DAY_SUN_COLOR = new Color3(1, 0.91, 0.78)
const TWILIGHT_SUN_COLOR = new Color3(1, 0.32, 0.1)
const NIGHT_SUN_COLOR = new Color3(0.3, 0.4, 0.68)
const DAY_FOG_COLOR = new Color3(0.2, 0.22, 0.24)
const TWILIGHT_FOG_COLOR = new Color3(0.16, 0.075, 0.045)
const NIGHT_FOG_COLOR = new Color3(0.018, 0.028, 0.055)
export const FOG_ENABLED = true
const DAY_FOG_START = 20
const DAY_FOG_END = 50
const NIGHT_FOG_START = 30
const NIGHT_FOG_END = 80
const SUN_BASE_AZIMUTH = Math.atan2(0.3, -0.75)
const SUN_AZIMUTH_RANGE = 20 * Math.PI / 180
const SUN_MIN_ELEVATION = 38 * Math.PI / 180
const SUN_MAX_ELEVATION = 48 * Math.PI / 180

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
    dayNightShadersWarmed: false,
    staticLightFlickerTime: 0,
    dayNightPhaseAtSync: SUNRISE_END_PHASE,
    dayNightCycleDurationMs: DEFAULT_DAY_NIGHT_CYCLE_DURATION_MS,
    dayNightSynchronizedAt: 0,
    daylightFactor: 1,
    localLightFactor: 0,
    sunLightActive: true,
    localLightsActive: false,
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
        this.dayNightShadersWarmed = false
        this.staticLightFlickerTime = 0
        this.dayNightPhaseAtSync = SUNRISE_END_PHASE
        this.dayNightCycleDurationMs = DEFAULT_DAY_NIGHT_CYCLE_DURATION_MS
        this.dayNightSynchronizedAt = performance.now()
        this.daylightFactor = 1
        this.localLightFactor = 0
        this.sunLightActive = true
        this.localLightsActive = false
        this.sunLight = new DirectionalLight("sunLight", new Vector3(-0.75, -0.75, 0.3), scene)
        this.sunLight.position = new Vector3(30, 30, 30);
        this.sunLight.diffuse = DAY_SUN_COLOR.clone()
        //this.sunLight.diffuse = new Color3(0.82, 0.91, 1)

        this.personalLight = new SpotLight(
            "personalIndoorLight",
            PERSONAL_LIGHT_POSITION.clone(),
            PERSONAL_LIGHT_DIRECTION.clone(),
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
            this.personalLight.shadowEnabled = true
        }

        //this.glowLayer = new GlowLayer("hl", this.scene)
        //this.glowLayer.intensity = 0.3
        //this.glowLayer.blurKernelSize = 1

        this.sunLight.setEnabled(true)
        this.personalLight.setEnabled(false)
        this.brightnessChanged()
    },

    configureStaticLightMaterials() {
        const staticLightLimit = STATIC_LIGHT_LIMITS[Settings.detailLevel.level - 1]
        const useStaticShadows = Settings.isDetalLevelHigh() && Settings.isShadowsEnabled()
        // This is a material capacity, not the number of lights in the current
        // day/night phase. Keep it stable: changing it while rendering can make
        // Babylon bind a light UBO compiled for a different shader layout.
        const maxLights = staticLightLimit + 2
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
            light.shadowEnabled = useStaticShadows && this.indoor
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
                flickerOffset: new Vector3(),
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
                flickerPhase: this.getStaticLightFlickerPhase(id),
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
        this.staticLightFlickerTime += timeRate
        this.updateDayNightLighting()
        if (this.staticLights.size === 0 || this.staticLightShadersWarming) {
            return
        }

        const playerPosition = MyPlayer.myChar?.pos
        const staticLightLimit = this.getStaticLightLimit()
        const usableSlots = this.staticLightSlots.slice(0, staticLightLimit)
        const candidates = Array.from(this.staticLights.values())
            .filter(source => source.visible)
            .sort((a, b) => {
                if (playerPosition == null) return 0
                return Vector3.DistanceSquared(a.position, playerPosition) - Vector3.DistanceSquared(b.position, playerPosition)
            })
        const activeSources = new Set(candidates.slice(0, staticLightLimit))

        for (const slot of this.staticLightSlots) {
            if (slot.source != null && (!activeSources.has(slot.source) || !usableSlots.includes(slot))) {
                slot.targetIntensity = 0
            }
        }

        for (const source of activeSources) {
            if (usableSlots.some(slot => slot.source === source)) {
                continue
            }
            const emptySlot = usableSlots.find(slot => slot.source == null && slot.currentIntensity === 0)
            if (emptySlot != null) {
                this.assignStaticLightSlot(emptySlot, source)
            }
        }

        this.staticLightSlots.forEach(slot => {
            const active = usableSlots.includes(slot) && slot.source != null && activeSources.has(slot.source)
            const flickerIntensity = active && this.shouldFlicker(slot.source!)
                ? this.getStaticLightFlickerIntensity(slot.source!)
                : 1
            slot.targetIntensity = active
                ? this.getStaticLightIntensity(slot.source!) * this.getStaticLightBrightnessFactor() * this.getLocalLightFactor() * flickerIntensity
                : 0

            if (slot.source != null) {
                const flickerPosition = slot.flickerOffset
                if (this.shouldFlicker(slot.source!)) {
                    this.updateStaticLightFlickerPosition(slot.source!, flickerPosition)
                } else {
                    flickerPosition.set(0, 0, 0)
                }
                slot.light.position.set(
                    slot.source.position.x + flickerPosition.x,
                    slot.source.position.y + slot.source.profile.height + flickerPosition.y,
                    slot.source.position.z + flickerPosition.z,
                )
                slot.light.range = this.getStaticLightRange(slot.source)
                if (slot.shadow != null) {
                    slot.light.shadowMaxZ = slot.light.range
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
        this.ensureMaterialLightCapacity(mesh, STATIC_LIGHT_LIMITS[Settings.detailLevel.level - 1] + 2)
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
        // Keep one immutable light layout for the whole outdoor cycle. Changing
        // mesh.lightSources at a phase boundary dirties every material and may
        // synchronously compile a new shader on the first cycle. Lights which
        // are not currently visible remain in the layout with zero intensity.
        const staticLights = this.staticLightSlots
            .slice(0, this.getStaticLightLimit())
            .map(slot => slot.light)
        const selectedLights: Array<DirectionalLight | SpotLight> = this.indoor
            ? [this.personalLight, ...staticLights]
            : [this.sunLight, this.personalLight, ...staticLights]
        const currentLights = mesh.lightSources

        if (currentLights.length === selectedLights.length && currentLights.every((light, index) => light === selectedLights[index])) {
            return
        }
        mesh._lightSources = selectedLights
        mesh._markSubMeshesAsLightDirty()
    },

    registerActorLightMesh(mesh: AbstractMesh) {
        this.ensureMaterialLightCapacity(mesh, ACTOR_STATIC_LIGHT_LIMIT + 1)
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

        const warmup = this.compileActorLightVariants(mesh, material)
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
        const meshPosition = mesh.getAbsolutePosition()
        const staticLightLimit = this.getActorStaticLightLimit()
        const availableSlots = this.staticLightSlots.slice(0, this.getStaticLightLimit())
        const selectedStaticSlots = availableSlots
            .filter(slot => slot.source != null)
            .filter(slot => Vector3.DistanceSquared(slot.light.position, meshPosition) <= Math.pow(slot.light.range, 2))
            .sort((a, b) => Vector3.DistanceSquared(a.light.position, meshPosition) - Vector3.DistanceSquared(b.light.position, meshPosition))
            .slice(0, staticLightLimit)
        // Pad with inert slots so changing the nearest sources preserves the
        // compiled shader shape for the current environment profile.
        const staticLights = [
            ...selectedStaticSlots,
            ...availableSlots.filter(slot => !selectedStaticSlots.includes(slot)),
        ].slice(0, staticLightLimit).map(slot => slot.light)
        const selectedLights: Array<DirectionalLight | SpotLight> = this.indoor
            ? [this.personalLight, ...staticLights]
            : [this.sunLight, this.personalLight, ...staticLights]
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

        const warmup = this.compileActorLightVariants(mesh, material)
            .catch(error => {
                console.warn('Local player light shader warm-up failed', error)
            })
        this.localPlayerLightWarmups.set(material, warmup)
        return warmup
    },

    async compileActorLightVariants(mesh: AbstractMesh, material: Material) {
        if (mesh.isDisposed() || mesh.material !== material) {
            return
        }

        const originalLightSources = mesh.lightSources.slice()
        this.ensureMaterialLightCapacity(mesh, ACTOR_STATIC_LIGHT_LIMIT + 1)
        const staticLights = this.staticLightSlots.slice(0, this.getActorStaticLightLimit()).map(slot => slot.light)
        const variants: Array<Array<DirectionalLight | SpotLight>> = [this.indoor
            ? [this.personalLight, ...staticLights]
            : [this.sunLight, this.personalLight, ...staticLights]]
        this.localPlayerLightWarmingMeshes.add(mesh)
        try {
            for (const variant of variants) {
                mesh._lightSources = variant
                mesh._markSubMeshesAsLightDirty()
                await material.forceCompilationAsync(mesh)
            }
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
        slot.light.range = this.getStaticLightRange(source)
        if (slot.shadow != null) {
            slot.light.shadowMaxZ = slot.light.range
        }
        slot.light.diffuse = source.profile.color
        slot.light.specular = source.profile.color
    },

    moveTowards(current: number, target: number, amount: number): number {
        if (current < target) return Math.min(current + amount * target, target)
        if (current > target) return Math.max(current - amount, target)
        return current
    },

    getStaticLightBrightnessFactor(): number {
        const brightness = Math.min(10, Math.max(1, Settings.brightness))
        return STATIC_LIGHT_MIN_BRIGHTNESS_FACTOR + ((brightness - 1) / 9)
    },

    getStaticLightIntensity(source: StaticLightSource): number {
        return source.profile.intensity * (this.indoor ? 1 : OUTDOOR_STATIC_LIGHT_INTENSITY_FACTOR)
    },

    getStaticLightRange(source: StaticLightSource): number {
        return source.profile.range * (this.indoor ? 1 : OUTDOOR_STATIC_LIGHT_RANGE_FACTOR)
    },

    shouldFlicker(source: StaticLightSource): boolean {
        return Settings.isDetalLevelHigh() && source.profile.flicker === true
    },

    getStaticLightFlickerPhase(id: string): number {
        let hash = 0
        for (let i = 0; i < id.length; i++) {
            hash = ((hash * 31) + id.charCodeAt(i)) | 0
        }
        return Math.abs(hash) * 0.017
    },

    getStaticLightFlickerIntensity(source: StaticLightSource): number {
        const time = this.staticLightFlickerTime
        const phase = source.flickerPhase
        return 1
            + (Math.sin((time * 5.3) + phase) * 0.055)
            + (Math.sin((time * 9.1) + (phase * 1.7)) * 0.035)
    },

    updateStaticLightFlickerPosition(source: StaticLightSource, position: Vector3) {
        const time = this.staticLightFlickerTime
        const phase = source.flickerPhase
        position.set(
            (Math.sin((time * 3.7) + phase) * 0.007) + (Math.sin((time * 6.1) + (phase * 1.4)) * 0.003),
            Math.sin((time * 4.3) + (phase * 0.8)) * 0.004,
            (Math.cos((time * 4.1) + phase) * 0.007) + (Math.cos((time * 6.7) + (phase * 1.6)) * 0.003),
        )
    },

    async warmUpStaticLightShaders(meshes: Array<Mesh | AbstractMesh>) {
        if (this.staticLightShadersWarmed || this.staticLightShadersWarming) {
            return
        }

        meshes.forEach(mesh => this.registerSharedLightMesh(mesh))
        this.staticLightShadersWarming = true
        try {
            const staticLights = this.staticLightSlots.slice(0, this.getStaticLightLimit()).map(slot => slot.light)
            const variants: Array<Array<DirectionalLight | SpotLight>> = [this.indoor
                ? [this.personalLight, ...staticLights]
                : [this.sunLight, this.personalLight, ...staticLights]]
            for (const variant of variants) {
                await this.warmUpStaticLightShaderVariant(meshes, variant)
            }

            this.staticLightShadersWarmed = true
        } catch (error) {
            console.warn('Static light shader warm-up failed', error)
        } finally {
            this.updateSharedLightMeshes()
            this.staticLightShadersWarming = false
        }
    },

    async warmUpStaticLightShaderVariant(meshes: Array<Mesh | AbstractMesh>, selectedLights: Array<DirectionalLight | SpotLight>) {
        meshes.forEach(mesh => {
            mesh._lightSources = selectedLights
            mesh._markSubMeshesAsLightDirty()
        })
        await Promise.all(meshes.map(mesh => mesh.material?.forceCompilationAsync(mesh, {useInstances: true})))
    },

    async warmUpDayNightCycle(onProgress?: (completed: number, total: number) => void) {
        if (this.dayNightShadersWarmed || this.indoor) {
            onProgress?.(1, 1)
            return
        }

        const scene = this.sunLight.getScene()
        onProgress?.(0, 1)
        try {
            // There is now only one topology for the entire outdoor cycle.
            // Compile its first visible frame behind the loading overlay; no
            // artificial day/transition/night passes are needed anymore.
            this.updateDayNightLighting()
            scene.markAllMaterialsAsDirty(Material.LightDirtyFlag)
            await scene.whenReadyAsync()
            scene.render()

            onProgress?.(1, 1)
            this.dayNightShadersWarmed = true
        } catch (error) {
            console.warn('Day/night shader warm-up failed', error)
        } finally {
            this.updateDayNightLighting()
        }
    },

    ensureMaterialLightCapacity(mesh: AbstractMesh, requiredCapacity: number) {
        const material = mesh.material as (Material & {maxSimultaneousLights?: number}) | null
        if (material == null || !('maxSimultaneousLights' in material)) {
            return
        }
        if ((material.maxSimultaneousLights ?? 0) < requiredCapacity) {
            material.maxSimultaneousLights = requiredCapacity
        }
    },

    attachPersonalLight(parent: TransformNode) {
        this.personalLight.parent = parent
        this.personalLight.position.copyFrom(PERSONAL_LIGHT_POSITION)
        this.personalLight.direction.copyFrom(PERSONAL_LIGHT_DIRECTION)
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

    pruneDisposedMeshReferences() {
        this.sharedLightMeshes.forEach(mesh => {
            if (mesh.isDisposed()) {
                this.sharedLightMeshes.delete(mesh)
            }
        })
        this.actorLightMeshes.forEach(mesh => {
            if (mesh.isDisposed()) {
                this.actorLightMeshes.delete(mesh)
            }
        })

        if (!Settings.isShadowsEnabled()) {
            return
        }
        const generators = [this.shadow, this.personalShadow, ...this.staticShadowGenerators]
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
    },

    brightnessChanged() {
        this.updateDayNightLighting()
    },

    setIndoor(indoor: boolean) {
        this.indoor = indoor
        this.staticLightSlots.forEach(slot => {
            slot.light.shadowEnabled = indoor && slot.shadow != null
        })
        this.brightnessChanged()
        this.updateSharedLightMeshes()
        this.updateActorLightMeshes()
    },

    synchronizeDayNightCycle(sync: DayNightCycleSync | null | undefined) {
        if (sync == null || !Number.isFinite(sync.phase) || !Number.isFinite(sync.cycleDurationMs) || sync.cycleDurationMs <= 0) {
            return
        }
        this.dayNightPhaseAtSync = ((sync.phase % 1) + 1) % 1
        this.dayNightCycleDurationMs = sync.cycleDurationMs
        this.dayNightSynchronizedAt = performance.now()
        this.updateDayNightLighting()
    },

    getDayNightPhase(): number {
        const elapsed = performance.now() - this.dayNightSynchronizedAt
        return (this.dayNightPhaseAtSync + (elapsed / this.dayNightCycleDurationMs)) % 1
    },

    getGameTimeInfo() {
        const phase = this.getDayNightPhase()
        const totalMinutes = Math.floor((360 + (phase * 24 * 60)) % (24 * 60))
        const hours = Math.floor(totalMinutes / 60)
        const minutes = totalMinutes % 60
        const phaseName = phase < SUNRISE_END_PHASE
            ? 'sunrise'
            : phase < SUNSET_START_PHASE
                ? 'day'
                : phase < SUNSET_END_PHASE
                    ? 'sunset'
                    : 'night'

        return {
            time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
            phaseName,
        }
    },

    updateDayNightLighting() {
        if (this.sunLight == null || typeof this.sunLight.getScene !== 'function') {
            return
        }

        const phase = this.getDayNightPhase()
        let daylightFactor = 0
        let twilightFactor = 0

        if (phase < SUNRISE_END_PHASE) {
            const progress = phase / SUNRISE_END_PHASE
            daylightFactor = this.smoothstep(progress)
            twilightFactor = Math.sin(Math.PI * progress)
        } else if (phase < SUNSET_START_PHASE) {
            daylightFactor = 1
        } else if (phase < SUNSET_END_PHASE) {
            const progress = (phase - SUNSET_START_PHASE) / (SUNSET_END_PHASE - SUNSET_START_PHASE)
            daylightFactor = 1 - this.smoothstep(progress)
            twilightFactor = Math.sin(Math.PI * progress)
        }

        this.daylightFactor = daylightFactor
        this.localLightFactor = 1 - daylightFactor
        this.updateLightTopology(
            !this.indoor && phase < SUNSET_END_PHASE,
            this.indoor || phase < SUNRISE_END_PHASE || phase >= SUNSET_START_PHASE,
        )

        const brightness = Math.min(10, Math.max(1, Settings.brightness))
        const sunIntensity = 0.5 + (brightness * 0.05)
        const personalIntensity = 2.5 + ((brightness - 1) / 9)
        const environmentIntensity = 0.25 + (brightness * 0.025)
        const scene = this.sunLight.getScene()
        this.updateFog(scene, daylightFactor)

        if (this.indoor) {
            this.sunLight.intensity = 0
            this.personalLight.intensity = personalIntensity
            scene.environmentIntensity = environmentIntensity / 8
            this.updateShadowRefreshRates(0, 1)
            return
        }

        this.sunLight.intensity = sunIntensity * (NIGHT_SUN_INTENSITY_FACTOR + ((1 - NIGHT_SUN_INTENSITY_FACTOR) * daylightFactor))
        this.personalLight.intensity = personalIntensity * OUTDOOR_PERSONAL_LIGHT_FACTOR * this.localLightFactor
        scene.environmentIntensity = environmentIntensity * (NIGHT_ENVIRONMENT_INTENSITY_FACTOR + ((1 - NIGHT_ENVIRONMENT_INTENSITY_FACTOR) * daylightFactor))

        this.setBlendedColor(this.sunLight.diffuse, NIGHT_SUN_COLOR, DAY_SUN_COLOR, TWILIGHT_SUN_COLOR, daylightFactor, twilightFactor, 0.72)
        this.sunLight.specular.copyFrom(this.sunLight.diffuse)
        this.setBlendedColor(scene.fogColor, NIGHT_FOG_COLOR, DAY_FOG_COLOR, TWILIGHT_FOG_COLOR, daylightFactor, twilightFactor, 0.45)
        this.updateSunDirection(phase)
        this.updateShadowRefreshRates(daylightFactor, this.localLightFactor)
    },

    updateFog(scene: Scene, daylightFactor: number) {
        if (!FOG_ENABLED || this.indoor) {
            if (scene.fogEnabled) {
                scene.fogEnabled = false
            }
            return
        }

        // Keep the fog shader active throughout the outdoor cycle. Switching
        // scene.fogEnabled at 20:00 dirties every material and caused a visible
        // first-cycle stall. Night uses a longer, subtler range but remains
        // visible in distant screen corners on wide displays.
        const nightFactor = 1 - daylightFactor
        scene.fogStart = DAY_FOG_START + ((NIGHT_FOG_START - DAY_FOG_START) * nightFactor)
        scene.fogEnd = DAY_FOG_END + ((NIGHT_FOG_END - DAY_FOG_END) * nightFactor)
        if (!scene.fogEnabled) {
            scene.fogEnabled = true
        }
    },

    getLocalLightFactor(): number {
        return this.indoor ? 1 : this.localLightFactor
    },

    getStaticLightLimit(): number {
        const limits = this.indoor ? STATIC_LIGHT_LIMITS : OUTDOOR_STATIC_LIGHT_LIMITS
        return limits[Settings.detailLevel.level - 1]
    },

    getActorStaticLightLimit(): number {
        return this.indoor ? ACTOR_STATIC_LIGHT_LIMIT : OUTDOOR_ACTOR_STATIC_LIGHT_LIMIT
    },

    updateLightTopology(sunActive: boolean, localActive: boolean) {
        const sunEnabled = !this.indoor
        const personalEnabled = true
        const enabledStateChanged = this.sunLight.isEnabled() !== sunEnabled
            || this.personalLight.isEnabled() !== personalEnabled
        this.sunLightActive = sunActive
        this.localLightsActive = localActive
        if (!enabledStateChanged) {
            return
        }

        this.sunLight.setEnabled(sunEnabled)
        this.personalLight.setEnabled(personalEnabled)
        this.updateSharedLightMeshes()
        this.updateActorLightMeshes()
    },

    updateShadowRefreshRates(daylightFactor: number, personalLightFactor: number) {
        if (!Settings.isShadowsEnabled()) {
            return
        }

        const sunShadowMap = this.shadow.getShadowMap()
        const personalShadowMap = this.personalShadow.getShadowMap()
        const sunRefreshRate = daylightFactor > 0.05
            ? RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME
            : RenderTargetTexture.REFRESHRATE_RENDER_ONCE
        const personalRefreshRate = personalLightFactor > 0.05
            ? RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME
            : RenderTargetTexture.REFRESHRATE_RENDER_ONCE

        if (sunShadowMap != null && sunShadowMap.refreshRate !== sunRefreshRate) {
            sunShadowMap.refreshRate = sunRefreshRate
        }
        if (personalShadowMap != null && personalShadowMap.refreshRate !== personalRefreshRate) {
            personalShadowMap.refreshRate = personalRefreshRate
        }
    },

    setBlendedColor(target: Color3, night: Color3, day: Color3, twilight: Color3, daylightFactor: number, twilightFactor: number, twilightStrength: number) {
        const baseR = night.r + ((day.r - night.r) * daylightFactor)
        const baseG = night.g + ((day.g - night.g) * daylightFactor)
        const baseB = night.b + ((day.b - night.b) * daylightFactor)
        const warmth = twilightFactor * twilightStrength
        target.set(
            baseR + ((twilight.r - baseR) * warmth),
            baseG + ((twilight.g - baseG) * warmth),
            baseB + ((twilight.b - baseB) * warmth),
        )
    },

    updateSunDirection(phase: number) {
        const daylightHalf = phase < SUNSET_START_PHASE
        const halfProgress = daylightHalf
            ? phase / SUNSET_START_PHASE
            : (phase - SUNSET_START_PHASE) / (1 - SUNSET_START_PHASE)
        const pathProgress = this.smoothstep(halfProgress)
        const azimuthOffset = daylightHalf
            ? -SUN_AZIMUTH_RANGE + (2 * SUN_AZIMUTH_RANGE * pathProgress)
            : SUN_AZIMUTH_RANGE - (2 * SUN_AZIMUTH_RANGE * pathProgress)
        const elevation = daylightHalf
            ? SUN_MIN_ELEVATION + (Math.sin(Math.PI * halfProgress) * (SUN_MAX_ELEVATION - SUN_MIN_ELEVATION))
            : SUN_MIN_ELEVATION
        const horizontal = Math.cos(elevation)
        const azimuth = SUN_BASE_AZIMUTH + azimuthOffset

        this.sunLight.direction.set(
            Math.cos(azimuth) * horizontal,
            -Math.sin(elevation),
            Math.sin(azimuth) * horizontal,
        )
    },

    smoothstep(value: number): number {
        const clamped = Math.min(1, Math.max(0, value))
        return clamped * clamped * (3 - (2 * clamped))
    }
}
