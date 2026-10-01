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
import { getBrightnessIntensityFactor, Settings } from '@/settings/settings'
import type { DayNightCycleSync } from '@/network/messageIfs'
import type { StaticLightProfile, StaticLightSlot, StaticLightSource } from '@/babylon/scene/lighting/lightTypes'
import {
    DEFAULT_DAY_NIGHT_CYCLE_DURATION_MS,
    DEFAULT_ENVIRONMENT_INTENSITY,
    INDOOR_PERSONAL_LIGHT_HEIGHT,
    INDOOR_PERSONAL_SHADOW_DARKNESS,
    INITIAL_DAY_NIGHT_PHASE,
    OUTDOOR_PERSONAL_LIGHT_HEIGHT,
    OUTDOOR_PERSONAL_SHADOW_DARKNESS,
    PERSONAL_LIGHT_DIRECTION,
    PERSONAL_LIGHT_POSITION,
    PERSONAL_LIGHT_X_OFFSET,
    PERSONAL_LIGHT_Z_OFFSET,
} from '@/babylon/scene/lighting/lightConfig'
import {
    FOG_ENABLED,
    getDayNightPhase,
    getGameTimeInfo,
    resetDayNightLighting,
    synchronizeDayNightCycle,
    updateDayNightLighting,
} from '@/babylon/scene/lighting/dayNightLighting'
import {
    clearStaticLights,
    configureStaticLightMaterials,
    getActorStaticLightLimit,
    getStaticLightLimit,
    onLightsFrame,
    registerStaticLight,
    resetStaticLighting,
    unregisterStaticLight,
    updateStaticLightShadowMode,
    warmUpStaticShadowMaps,
    warmUpStaticLightShaders,
} from '@/babylon/scene/lighting/staticLighting'
import {
    ActorStaticShadowRangeTest,
    addShadowCaster as addMeshShadowCaster,
    compileActorLightVariants,
    pruneDisposedMeshReferences,
    registerActorLightMesh,
    registerSharedLightMesh,
    removeShadowCaster as removeMeshShadowCaster,
    resetMeshLighting,
    supportsParallelShaderCompilation,
    unregisterActorLightMesh,
    unregisterSharedLightMesh,
    updateActorLightMesh,
    updateActorLightMeshes,
    updateActorStaticShadowCasters,
    updateSharedLightMesh,
    updateSharedLightMeshes,
    warmActorMaterial,
    warmLocalPlayerLightMaterial,
    warmUpStaticLightShaderVariant,
} from '@/babylon/scene/lighting/meshLighting'

export { FOG_ENABLED }
export type { StaticLightProfile }

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
    actorStaticShadowCasters: new Set<AbstractMesh>(),
    unfilteredActorStaticShadowCasters: new Set<AbstractMesh>(),
    actorStaticShadowRangeTests: new WeakMap<AbstractMesh, ActorStaticShadowRangeTest>(),
    actorMaterialWarmups: new WeakMap<Material, Promise<void>>(),
    localPlayerLightWarmups: new WeakMap<Material, Promise<void>>(),
    localPlayerLightWarmingMeshes: new Set<AbstractMesh>(),
    staticLightShadersWarmed: false,
    staticLightShadersWarming: false,
    dayNightShadersWarmed: false,
    staticLightFlickerTime: 0,
    actorStaticShadowCasterUpdateTime: 0,
    staticLightAssignmentUpdateTime: 0,
    staticLightAssignmentsDirty: true,
    dayNightPhaseAtSync: INITIAL_DAY_NIGHT_PHASE,
    dayNightCycleDurationMs: DEFAULT_DAY_NIGHT_CYCLE_DURATION_MS,
    dayNightSynchronizedAt: 0,
    dayNightPaused: false,
    daylightFactor: 1,
    localLightFactor: 0,
    indoor: false,

    initialize(scene: Scene) {
        resetStaticLighting(this)
        resetMeshLighting(this)
        this.dayNightShadersWarmed = false
        resetDayNightLighting(this)
        this.sunLight = new DirectionalLight("sunLight", new Vector3(-0.75, -0.75, 0.3), scene)
        this.sunLight.position = new Vector3(30, 30, 30);
        this.sunLight.diffuse = new Color3(1, 0.91, 0.78)

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
        this.personalLight.range = Settings.deviceType === 'PHONE'
            ? 11
            : Settings.deviceType === 'TABLET' ? 13 : 14

        if (Settings.isShadowsEnabled()) {
            this.shadow = new ShadowGenerator(Settings.detailLevel.shadowQuality == 2 ? 4096 : 2048, this.sunLight, false)
            this.shadow.bias = 0.00001
            this.shadow.setDarkness(0)
            this.shadow.usePoissonSampling = true
            this.shadow.forceBackFacesOnly = true
            this.personalShadow = new ShadowGenerator(Settings.detailLevel.shadowQuality == 2 ? 2048 : 1024, this.personalLight, false)
            this.personalShadow.bias = 0.005
            this.personalShadow.setDarkness(OUTDOOR_PERSONAL_SHADOW_DARKNESS)
            this.personalShadow.usePoissonSampling = true
            this.personalShadow.frustumEdgeFalloff = 0.3
            this.personalLight.shadowMinZ = 0.05
            this.personalLight.shadowMaxZ = this.personalLight.range
            this.personalLight.shadowEnabled = true
        }

        this.sunLight.setEnabled(true)
        this.personalLight.setEnabled(false)
        this.brightnessChanged()
    },

    configureStaticLightMaterials() {
        configureStaticLightMaterials(this)
        updateActorStaticShadowCasters(this)
    },

    registerStaticLight(id: string, position: Vector3, profile: StaticLightProfile) {
        registerStaticLight(this, id, position, profile)
    },

    unregisterStaticLight(id: string) {
        unregisterStaticLight(this, id)
    },

    clearStaticLights() {
        clearStaticLights(this)
    },

    onFrame(timeRate: number) {
        onLightsFrame(this, timeRate)
    },

    registerDynamicLightMesh(mesh: AbstractMesh, _positionResolver?: () => Vector3 | null) {
        this.registerSharedLightMesh(mesh)
    },

    unregisterDynamicLightMesh(mesh: AbstractMesh) {
        this.unregisterSharedLightMesh(mesh)
    },

    registerSharedLightMesh(mesh: AbstractMesh) {
        registerSharedLightMesh(this, mesh)
    },

    unregisterSharedLightMesh(mesh: AbstractMesh) {
        unregisterSharedLightMesh(this, mesh)
    },

    updateSharedLightMeshes() {
        updateSharedLightMeshes(this)
    },

    updateSharedLightMesh(mesh: AbstractMesh) {
        updateSharedLightMesh(this, mesh)
    },

    registerActorLightMesh(mesh: AbstractMesh) {
        registerActorLightMesh(this, mesh)
    },

    unregisterActorLightMesh(mesh: AbstractMesh) {
        unregisterActorLightMesh(this, mesh)
    },

    supportsParallelShaderCompilation(): boolean {
        return supportsParallelShaderCompilation(this)
    },

    warmActorMaterial(mesh: AbstractMesh): Promise<void> {
        return warmActorMaterial(this, mesh)
    },

    updateActorLightMeshes() {
        updateActorLightMeshes(this)
    },

    updateActorLightMesh(mesh: AbstractMesh) {
        updateActorLightMesh(this, mesh)
    },

    updateActorStaticShadowCasters() {
        updateActorStaticShadowCasters(this)
    },

    warmLocalPlayerLightMaterial(mesh: AbstractMesh): Promise<void> {
        return warmLocalPlayerLightMaterial(this, mesh)
    },

    async compileActorLightVariants(mesh: AbstractMesh, material: Material) {
        await compileActorLightVariants(this, mesh, material)
    },

    getEnvironmentIntensity(): number {
        return DEFAULT_ENVIRONMENT_INTENSITY * getBrightnessIntensityFactor(Settings.brightness)
    },

    async warmUpStaticLightShaders(meshes: Array<Mesh | AbstractMesh>) {
        await warmUpStaticLightShaders(this, meshes)
    },

    async warmUpStaticLightShaderVariant(meshes: Array<Mesh | AbstractMesh>, selectedLights: Array<DirectionalLight | SpotLight>) {
        await warmUpStaticLightShaderVariant(meshes, selectedLights)
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
            warmUpStaticShadowMaps(this)
            scene.render()

            onProgress?.(1, 1)
            this.dayNightShadersWarmed = true
        } catch (error) {
            console.warn('Day/night shader warm-up failed', error)
        } finally {
            this.updateDayNightLighting()
        }
    },

    attachPersonalLight(parent: TransformNode) {
        this.personalLight.parent = parent
        this.updatePersonalLightPosition()
        this.personalLight.direction.copyFrom(PERSONAL_LIGHT_DIRECTION)
    },

    updatePersonalLightPosition() {
        this.personalLight.position.set(
            PERSONAL_LIGHT_X_OFFSET,
            this.indoor ? INDOOR_PERSONAL_LIGHT_HEIGHT : OUTDOOR_PERSONAL_LIGHT_HEIGHT,
            PERSONAL_LIGHT_Z_OFFSET,
        )
    },

    addShadowCaster(mesh: Mesh | AbstractMesh, castPersonalShadow: boolean = true, castStaticShadow: boolean = false, castOutdoorStaticShadow: boolean = false, filterActorStaticShadowByDistance: boolean = true, actorStaticShadowRangeTest?: ActorStaticShadowRangeTest) {
        addMeshShadowCaster(this, mesh, castPersonalShadow, castStaticShadow, castOutdoorStaticShadow, filterActorStaticShadowByDistance, actorStaticShadowRangeTest)
    },

    removeShadowCaster(mesh: Mesh | AbstractMesh, castPersonalShadow: boolean = true, castStaticShadow: boolean = false, castOutdoorStaticShadow: boolean = false) {
        removeMeshShadowCaster(this, mesh, castPersonalShadow, castStaticShadow, castOutdoorStaticShadow)
    },

    pruneDisposedMeshReferences() {
        pruneDisposedMeshReferences(this)
    },

    brightnessChanged() {
        this.updateDayNightLighting()
    },

    setIndoor(indoor: boolean) {
        this.indoor = indoor
        this.staticLightAssignmentsDirty = true
        this.updatePersonalLightPosition()
        if (Settings.isShadowsEnabled()) {
            this.personalShadow.setDarkness(
                indoor ? INDOOR_PERSONAL_SHADOW_DARKNESS : OUTDOOR_PERSONAL_SHADOW_DARKNESS,
            )
        }
        updateActorStaticShadowCasters(this)
        updateStaticLightShadowMode(this)
        this.brightnessChanged()
        this.updateSharedLightMeshes()
        this.updateActorLightMeshes()
    },

    synchronizeDayNightCycle(sync: DayNightCycleSync | null | undefined) {
        synchronizeDayNightCycle(this, sync)
    },

    getDayNightPhase(): number {
        return getDayNightPhase(this)
    },

    getGameTimeInfo() {
        return getGameTimeInfo(this)
    },

    updateDayNightLighting() {
        updateDayNightLighting(this)
    },

    getStaticLightLimit(): number {
        return getStaticLightLimit(this)
    },

    getActorStaticLightLimit(): number {
        return getActorStaticLightLimit(this)
    },

}
