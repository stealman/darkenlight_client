import '@babylonjs/core/Shaders/pbr.vertex.js'
import '@babylonjs/core/Shaders/pbr.fragment.js'
import { WorldAreaManager } from '@/data/worldAreaManager'
import {
    Engine,
    Scene,
    Vector3,
    FreeCamera,
    Color3, Color4, SceneInstrumentation,
    CubeTexture, DracoCompression, Material,
} from '@babylonjs/core'
import '@babylonjs/inspector'
import { Controller } from '@/controlls/controller'
import {MyPlayer} from "@/data/myPlayer"
import screenFull from 'screenfull'
import {Settings} from "@/settings/settings";
import {WorldRenderer} from "@/babylon/world/worldRenderer";
import { MiniMap } from '@/utils/minimap'
import { Materials } from '@/babylon/materials'
import { AudioManager } from '@/babylon/audio/audioManager'
import { ViewportManager } from '@/utils/viewport'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { updateGrassInteractions } from '@/babylon/world/grassInteractions'
import { GAME_GRASS_ENABLED } from '@/babylon/world/grassRenderer'
import { NpcManager } from '@/babylon/npc/npcManager'
import { Connector } from '@/network/connector'
import { EquipManager } from '@/babylon/item/equipManager'
import { WeatherManager } from '@/babylon/world/weather/weatherManager'
import { GMManager} from '@/gm/GM'
import { OverlayManager } from '@/gui/overlay/overlayManager'
import { TargetingManager } from '@/gui/targettingManager'
import { StepMarksRenderer } from '@/babylon/world/stepMarksRenderer'
import { FOG_ENABLED, Lights } from '@/babylon/scene/lights'
import { FightSplatsRenderer } from '@/babylon/world/fightSplatsRenderer'
import { OnScreenMessageManager } from '@/gui/onScreenMessageManager'
import { CharacterManager } from '@/babylon/character/characterManager'
import { SelectedTargetPanel } from '@/gui/selectedTargetPanel'
import { ArrowsManager } from '@/babylon/world/arrowsManager'
import { MyStatusPanel } from '@/gui/myStatusPanel'
import { Inspector } from '@babylonjs/inspector'
import { ActionButtonsManager } from '@/gui/actionButtonsManager'
import { GuiButtonsManager } from '@/gui/guiButtonsManager'
import { GroundItemsManager } from '@/babylon/world/groundItemsManager'
import { EmeraldsManager } from '@/gui/emeraldsManager'
import { GfxManager } from '@/babylon/gfx/gfxManager'
import { setSpellGlowEnabled } from '@/babylon/gfx/magicArrowEffect'
import { StaticsManager } from '@/babylon/world/statics/staticsManager'
import { TreeManager } from '@/babylon/world/treeManager'
import { BuildingManager } from '@/babylon/world/buildings/buildingManager'
import { NIGHT_ENVIRONMENT_INTENSITY_FACTOR } from '@/babylon/scene/lighting/lightConfig'
import { invoke } from '@tauri-apps/api/core'
import { FoggyAreaManager } from '@/babylon/world/foggyAreaManager'
import { ActiveMeshFreezer } from '@/babylon/scene/activeMeshFreezer'
import { IndoorTerrainOcclusionManager } from '@/babylon/world/indoorTerrainOcclusionManager'
import { modelAssetUrl } from '@/babylon/modelAssetUrl'
import { ActorContactShadows } from '@/babylon/world/actorContactShadows'

function isTauriDesktop(): boolean {
    return '__TAURI_INTERNALS__' in window
}

/**
 * Main Renderer
 */
// Keyboard Lock keeps a short Escape press available to the game in browser fullscreen.
// Browsers retain their long-press escape hatch and may require user permission.
let fullscreenKeyboardListenerInstalled = false
const installFullscreenKeyboardLock = () => {
    if (fullscreenKeyboardListenerInstalled) return
    const keyboard = (navigator as Navigator & {
        keyboard?: {lock(keys: string[]): Promise<void>, unlock(): void}
    }).keyboard
    if (!keyboard?.lock) return
    fullscreenKeyboardListenerInstalled = true
    screenFull.on('change', () => {
        if (screenFull.isFullscreen) {
            void keyboard.lock(['Escape']).catch(() => {
                // Fullscreen remains usable when permission is denied.
            })
        } else {
            keyboard.unlock()
        }
    })
}

export const Renderer = {
    canvas: null as HTMLCanvasElement | null,
    scene: null as Scene,
    instrumentation: null as SceneInstrumentation | null,
    engine: null as Engine | null,
    camera: null as FreeCamera | null,
    actorContactShadows: null as ActorContactShadows | null,

    menuPreviewSceneUsed: false,

    fps: 0 as number,
    frame: 0 as number,
    animationSpeedRatio: 1 as number,
    environmentType: 'outdoor' as 'outdoor' | 'indoor',

    inspectorDisplayed: false,

    async initialize(canvas: HTMLCanvasElement) {
        this.canvas = canvas
        this.frame = 0
        this.engine = new Engine(canvas, Settings.detailLevel.antialias)
        this.engine.setHardwareScalingLevel(1)
        this.createScene(this.engine)
        this.updateSpellGlow()
        this.menuPreviewSceneUsed = false

        DracoCompression.Configuration = {
            decoder: {
                wasmUrl: window.location.origin + modelAssetUrl('/models/draco/draco_decoder_gltf.wasm'),
                fallbackUrl: window.location.origin + modelAssetUrl('/models/draco/draco_decoder_gltf.js'),
            }
        };

        // Initialize game objects and managers
        this.instrumentation = new SceneInstrumentation(this.scene);
        this.instrumentation.captureFrameTime = true;
        this.instrumentation.captureActiveMeshesEvaluationTime = true

        Lights.initialize(this.scene, {terrainSunShadows: true})
        this.actorContactShadows = Settings.isDetalLevelLow() ? new ActorContactShadows(this.scene) : null
        AudioManager.initialize(this.scene)
        MiniMap.initialize()
        CharacterManager.initialize()
        await NpcManager.initialize()
        await EquipManager.initialize(this.scene)
        await MonsterManager.initialize()
        GfxManager.initialize(this.scene)

        Controller.initializeController(this.scene)
        Materials.initialize(this.scene)
        Lights.configureStaticLightMaterials()
        await CharacterManager.preloadModels(this.scene)
        StepMarksRenderer.initialize(this.scene)
        await WorldRenderer.initialize(this.scene)
        WeatherManager.initialize()
        FightSplatsRenderer.initialize()
        GroundItemsManager.initialize(this.scene)
        ArrowsManager.initialize()
        SelectedTargetPanel.initialize()
        OnScreenMessageManager.initialize()
        MyStatusPanel.initialize()
        EmeraldsManager.initialize()
        ActionButtonsManager.initialize()
        GuiButtonsManager.initialize()
        ActiveMeshFreezer.initialize(this.scene)

        await OverlayManager.initialize()
        await TargetingManager.initialize()
    },

    prepareGameView() {
        if (this.camera == null) this.createCamera()
        if (!ViewportManager.viewPortInitialized) ViewportManager.calculateViewport(this.camera!)
    },

    async gameStarted(onWarmupProgress?: (completed: number, total: number) => void) {
        Lights.sunLight.parent = MyPlayer.myModel!.node
        Lights.attachPersonalLight(MyPlayer.myModel!.node)
        MyStatusPanel.panel!.style.display = 'flex'
        const { WorldDataManager } = await import('@/data/worldDataManager')
        await Promise.all([WorldDataManager.terrainRenderLoad?.ready, EquipManager.preloadWeapons()])

        // The first scene uses the player and the nearby entities from the login frame.
        this.prepareGameView()
        WorldRenderer.renderWorld()
        GroundItemsManager.updateVisibleItems()
        GroundItemsManager.renderItems()
        if (EquipManager.pendingModels.size > 0) {
            await Promise.all(EquipManager.pendingModels.values())
            WorldRenderer.renderWorld()
            GroundItemsManager.renderItems()
        }
        EquipManager.onFrame()

        onWarmupProgress?.(0, 4)
        await WorldRenderer.warmUpOcclusionFadeShaders()
        onWarmupProgress?.(1, 4)
        await CharacterManager.warmUpAppearance(this.scene)
        onWarmupProgress?.(2, 4)
        await MonsterManager.prepareModels()
        onWarmupProgress?.(3, 4)
        await Lights.warmUpDayNightCycle((completed, total) => {
            onWarmupProgress?.(3 + completed, 3 + total)
        })

        ActiveMeshFreezer.start()

        const engine = this.engine!
        await new Promise<void>(resolve => {
            engine.onEndFrameObservable.addOnce(() => resolve())
            engine.runRenderLoop(() => this.onFrame(this.scene))
        })
    },

    async gameStopped() {
        this.engine!.stopRenderLoop()
        ArrowsManager.clear()
        MonsterManager.clearWorld()
        GfxManager.clear()
        this.scene.dispose()
        this.camera?.dispose()
        this.camera = null
        this.engine?.dispose()
        AudioManager.stopAmbientSound()
        await this.initialize(this.canvas!)
    },

    /**
     * Main game loop
     */
    onFrame(scene: Scene) {
        this.frame++
        const actualTime = new Date().getTime()
        let timeRate = this.engine!.getDeltaTime() / 1000
        this.fps = Number.parseInt(this.engine!.getFps()!.toFixed());

        if (timeRate > 0.1) {
            console.log("Low frame rate detected: " + this.fps + " FPS, timeRate: " + timeRate)
            timeRate = 0.1
        }

        if (this.camera == null) {
            this.createCamera()

            // Schovam debug labely na mobilu
            if (Settings.isPhoneOrTablet()) {
            }
        }

        if (this.frame > 1) {
            // Animation speeds are calculated to 60 FPS base
            this.animationSpeedRatio = timeRate * 60

            MyPlayer.onFrame(timeRate, actualTime)
            if (MyPlayer.myChar) WorldAreaManager.updateLocation(MyPlayer.worldId, MyPlayer.myChar.pos.x, MyPlayer.myChar.pos.z, actualTime)
            Materials.onFrame(actualTime)
            WorldRenderer.checkRenderWorld()
            if (IndoorTerrainOcclusionManager.onFrame(timeRate)) WorldRenderer.renderWorld()
            StaticsManager.onFrame(timeRate, actualTime)
            TreeManager.onFrame(timeRate, this.camera)
            BuildingManager.onFrame(timeRate, this.camera)
            Lights.onFrame(timeRate)
            StepMarksRenderer.field?.onFrame(actualTime, Lights.indoor ? 1 : Lights.localLightFactor)
            FoggyAreaManager.onFrame()
            CharacterManager.onFrame(timeRate, actualTime, this.frame)
            NpcManager.onFrame(timeRate, actualTime, this.frame)
            MonsterManager.onFrame(timeRate, actualTime, this.frame)
            if (GAME_GRASS_ENABLED) updateGrassInteractions(actualTime)
            GroundItemsManager.onFrame(timeRate, actualTime)
            Controller.updateHoverNames(scene, actualTime)

            GfxManager.onFrame(actualTime)
            ArrowsManager.onFrame(timeRate, actualTime)
            TargetingManager.onFrame(timeRate, actualTime)
            OverlayManager.updateTargetMarkers(actualTime, Settings.targetMarkerOpacity)
            OnScreenMessageManager.onFrame(actualTime)
            if (!Settings.isDetalLevelLow()) {
                OverlayManager.onFrame(timeRate, actualTime)
            }
            if (GMManager.gmPanelVisible.value) GMManager.onFrame(timeRate, actualTime)
        }

        if (this.frame % 2 === 0) {
            if (Settings.isDetalLevelLow()) {
                OverlayManager.onFrame(timeRate, actualTime)
            }

            SelectedTargetPanel.onFrame(actualTime)
            MyStatusPanel.onFrame(actualTime)
            ActionButtonsManager.onFrame(actualTime)
            GuiButtonsManager.onFrame(actualTime)
            EmeraldsManager.onFrame(actualTime)
        }

        if (this.frame % 10 === 0) {
            this.actualizeDebug()
        }

        if (this.frame % 10 === 2) {
            StepMarksRenderer.update(actualTime)
            FightSplatsRenderer.update(actualTime)
        }

        if (this.frame % 10 === 7) {
            StaticsManager.resolveSounds()
        }

        if (this.frame % 60 === 15) {
            MiniMap.updateMiniMap()
        }

        if (this.frame % 60 === 30) {
            WeatherManager.update()
        }

        if (this.frame % 60 === 45) {
            AudioManager.processOneFrame()
        }

        if (this.frame % 600 === 0) {
            StepMarksRenderer.updateInLocalStorage()
        }

        Connector.processMessages(actualTime)
        this.actorContactShadows?.update()
        scene.render()

        if (!ViewportManager.viewPortInitialized) ViewportManager.calculateViewport(this.camera)
    },

    setCullingFrequency(scene: Scene, everyNFrames: number) {
        // Unfreeze world matrix pro rodice vseho u ceho budeme delat instancedMeshe
        // ShotMgr.pulseLaserMesh.unfreezeWorldMatrix();

        let frameCount = 0;
        scene.onBeforeRenderObservable.add(() => {
            frameCount++
            if (frameCount % everyNFrames === 0) {

                // Manuální update world matric jen pro root mesh vsech instanci
                // ShotMgr.pulseLaserMesh.computeWorldMatrix(true)
            }
        });
    },

    updateSpellGlow() {
        if (this.scene) setSpellGlowEnabled(this.scene, Settings.isGlowLayerEnabled())
    },

    createScene(engine: Engine) {
        this.scene = new Scene(engine)
        // Upload equipment after Babylon has evaluated this frame's bone animation.
        this.scene.onBeforeRenderObservable.add(() => EquipManager.onFrame())
        this.scene.clearColor = new Color4(0, 0, 0, 1)
        this.scene.imageProcessingConfiguration.exposure = 1.2
        this.scene.skipPointerMovePicking = true
        this.scene.autoClear = false
        this.scene.autoClearDepthAndStencil = false

        this.scene.fogMode = Scene.FOGMODE_LINEAR
        this.scene.fogStart = 20
        this.scene.fogEnd = 50
        this.scene.fogColor = new Color3(0.2, 0.22, 0.24)
        this.scene.fogEnabled = FOG_ENABLED

        this.scene.environmentTexture = this.createEnvironmentTexture(this.scene)
        this.brightnessChanged()
    },

    createEnvironmentTexture(scene: Scene) {
        return CubeTexture.CreateFromPrefilteredData('environment_specular.env', scene)
    },

    brightnessChanged() {
        if (!this.scene) {
            return
        }
        const defaultEnvironmentIntensity = Lights.getEnvironmentIntensity()
        this.scene.environmentIntensity = this.environmentType === 'indoor'
            ? defaultEnvironmentIntensity * NIGHT_ENVIRONMENT_INTENSITY_FACTOR
            : defaultEnvironmentIntensity
        this.scene.fogEnabled = FOG_ENABLED && this.environmentType !== 'indoor'

        this.scene.markAllMaterialsAsDirty(Material.AllDirtyFlag)
    },

    setWorldEnvironmentType(environmentType: string | null | undefined) {
        this.environmentType = environmentType === 'indoor' ? 'indoor' : 'outdoor'
        AudioManager.setAmbientSoundForEnvironment(this.environmentType)
        this.brightnessChanged()
        Lights.setIndoor(this.environmentType === 'indoor')
        this.updateCameraForEnvironment()
    },

    getCameraSetup() {
        let cameraPosition = new Vector3(-12, 12, -12)
        if (Settings.touchEnabled) {
            cameraPosition = new Vector3(-10, 12, -10)
        }
        let cameraViewY = -2
        if (Settings.closeView || false) {
            cameraPosition.x = -5
            cameraPosition.y = 5
            cameraPosition.z = -5
            cameraViewY = 0
        }

        if (this.environmentType === 'indoor') {
            const cameraDistance = cameraPosition.length()
            const outdoorHorizontalDistance = Math.sqrt(cameraPosition.x ** 2 + cameraPosition.z ** 2)
            const previousIndoorY = Math.min(
                cameraDistance,
                cameraPosition.y + (Settings.closeView ? 1 : 3),
            )
            const outdoorAngle = Math.atan2(cameraPosition.y, outdoorHorizontalDistance)
            const previousIndoorAngle = Math.asin(previousIndoorY / cameraDistance)
            const indoorAngle = outdoorAngle + (previousIndoorAngle - outdoorAngle) * 0.5
            const indoorHorizontalDistance = Math.cos(indoorAngle) * cameraDistance

            cameraPosition.y = Math.sin(indoorAngle) * cameraDistance
            if (outdoorHorizontalDistance > 0) {
                const horizontalScale = indoorHorizontalDistance / outdoorHorizontalDistance
                cameraPosition.x *= horizontalScale
                cameraPosition.z *= horizontalScale
            }
        }

        cameraPosition.scaleInPlace(Settings.cameraDistance / 100)

        return { cameraPosition, cameraViewY }
    },

    updateCameraForEnvironment() {
        if (!this.camera) {
            return
        }

        const { cameraPosition, cameraViewY } = this.getCameraSetup()
        this.camera.position.copyFrom(cameraPosition)
        this.camera.setTarget(new Vector3(0, cameraViewY, 0))
    },

    createCamera() {
        const { cameraPosition, cameraViewY } = this.getCameraSetup()

        this.camera = new FreeCamera('camera1', cameraPosition, this.scene)
        this.camera.setTarget(new Vector3(0, cameraViewY, 0))
        this.camera.parent = MyPlayer.myModel!.node
    },

    toggleDebug() {
        if (!this.inspectorDisplayed) {
            Inspector.Show(this.scene, {})
            this.inspectorDisplayed = true
        } else {
            Inspector.Hide()
            this.inspectorDisplayed = false
        }
    },

    actualizeDebug() {
        const absoluteFPS = 1000 / this.instrumentation!.frameTimeCounter.lastSecAverage
        const activeMeshesMs = this.instrumentation!.activeMeshesEvaluationTimeCounter.lastSecAverage
        MiniMap.setDebugInfo(
            `${this.fps} | ${absoluteFPS.toFixed(0)} | AM ${activeMeshesMs.toFixed(2)}ms`,
            MyPlayer.myChar?.getPositionRounded().toString() ?? '-'
        )
    },

    async requestFullscreen() {
        if (isTauriDesktop()) {
            await invoke('set_fullscreen', { fullscreen: true })
            return
        }
        if (screenFull.request) {
            installFullscreenKeyboardLock()
            await screenFull.request()
        }
    },

    async toggleFullscreen() {
        if (isTauriDesktop()) {
            await invoke('toggle_fullscreen')
            return
        }
        if (screenFull.toggle) {
            installFullscreenKeyboardLock()
            await screenFull.toggle()
        }
    },

    async exitFullscreen() {
        if (isTauriDesktop()) {
            await invoke('set_fullscreen', { fullscreen: false })
            return
        }
        if (screenFull.isFullscreen && screenFull.exit) {
            screenFull.exit()
        }
    },
}
