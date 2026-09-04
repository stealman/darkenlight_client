import {
    Engine,
    Scene,
    Vector3,
    FreeCamera,
    Color3, Color4, SceneInstrumentation,
    CubeTexture, DracoCompression, Material, GlowLayer,
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
import { NpcManager } from '@/babylon/npc/npcManager'
import { Connector } from '@/network/connector'
import { EquipManager } from '@/babylon/item/equipManager'
import { WeatherManager } from '@/babylon/world/weather/weatherManager'
import { GMManager} from '@/gm/GM'
import { OverlayManager } from '@/gui/overlay/overlayManager'
import { TargetingManager } from '@/gui/targettingManager'
import { StepMarksRenderer } from '@/babylon/world/stepMarksRenderer'
import { Lights } from '@/babylon/scene/lights'
import { FightSplatsRenderer } from '@/babylon/world/fightSplatsRenderer'
import { OnScreenMessageManager } from '@/gui/onScreenMessageManager'
import { CharacterManager } from '@/babylon/character/characterManager'
import { SelectedTargetPanel } from '@/gui/selectedTargetPanel'
import { Tester } from '@/babylon/tester'
import { ArrowsManager } from '@/babylon/world/arrowsManager'
import { MyStatusPanel } from '@/gui/myStatusPanel'
import { Inspector } from '@babylonjs/inspector'
import { ActionButtonsManager } from '@/gui/actionButtonsManager'
import { GuiButtonsManager } from '@/gui/guiButtonsManager'
import { GroundItemsManager } from '@/babylon/world/groundItemsManager'
import { EmeraldsManager } from '@/gui/emeraldsManager'
import { GfxManager } from '@/babylon/gfx/gfxManager'
import { StaticsManager } from '@/babylon/world/statics/staticsManager'

/**
 * Main Renderer
 */
export const Renderer = {
    canvas: null as HTMLCanvasElement | null,
    scene: null as Scene,
    instrumentation: null as SceneInstrumentation | null,
    engine: null as Engine | null,
    camera: null as FreeCamera | null,

    fps: 0 as number,
    frame: 0 as number,
    animationSpeedRatio: 1 as number,
    environmentType: 'outdoor' as 'outdoor' | 'indoor',

    inspectorDisplayed: false,
    glowLayer: null as GlowLayer | null,

    async initialize(canvas: HTMLCanvasElement) {
        this.canvas = canvas
        this.engine = new Engine(canvas, Settings.detailLevel.antialias)
        this.engine.setHardwareScalingLevel(1)
        this.createScene(this.engine)

        DracoCompression.Configuration = {
            decoder: {
                wasmUrl: `${window.location.origin}/models/draco/draco_decoder_gltf.wasm`,
                fallbackUrl: `${window.location.origin}/models/draco/draco_decoder_gltf.js`,
            }
        };

        /**
        if (Settings.displayGlow) {
            this.glowLayer = new GlowLayer("glow", this.scene, {
                mainTextureFixedSize: 1024,
                blurKernelSize: 75
            });
            this.glowLayer.intensity = 5
        }*/

        // Initialize game objects and managers
        this.instrumentation = new SceneInstrumentation(this.scene);
        this.instrumentation.captureFrameTime = true;

        Lights.initialize(this.scene)
        AudioManager.initialize(this.scene)
        MiniMap.initialize()
        CharacterManager.initialize()
        NpcManager.initialize()
        await EquipManager.initialize(this.scene)
        await MonsterManager.initialize()
        GfxManager.initialize(this.scene)

        Controller.initializeController(this.scene)
        Materials.initialize(this.scene)
        WorldRenderer.initialize(this.scene)
        WeatherManager.initialize()
        StepMarksRenderer.initialize(this.scene)
        FightSplatsRenderer.initialize(this.scene)
        GroundItemsManager.initialize(this.scene)
        ArrowsManager.initialize()
        SelectedTargetPanel.initialize()
        MyStatusPanel.initialize()
        EmeraldsManager.initialize()
        ActionButtonsManager.initialize()
        GuiButtonsManager.initialize()

        await OverlayManager.initialize()
        await TargetingManager.initialize()
    },

    async gameStarted() {
        Lights.sunLight.parent = MyPlayer.myModel!.node
        Lights.attachPersonalLight(MyPlayer.myModel!.node)
        MyStatusPanel.panel!.style.display = 'flex'
        await Tester.runTest()
        this.engine!.runRenderLoop(() => {
            this.onFrame(this.scene)
        })
    },

    gameStopped() {
        this.engine!.stopRenderLoop()
        GfxManager.clear()
        this.scene.dispose()
        this.camera?.dispose()
        this.camera = null
        this.engine?.dispose()
        this.initialize(this.canvas!)
        AudioManager.stopAmbientSound()
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
            WorldRenderer.checkRenderWorld()
            CharacterManager.onFrame(timeRate, actualTime, this.frame)
            NpcManager.onFrame(timeRate, actualTime, this.frame)
            MonsterManager.onFrame(timeRate, actualTime, this.frame)
            GroundItemsManager.onFrame(timeRate, actualTime)

            EquipManager.onFrame()
            GfxManager.onFrame(actualTime)
            ArrowsManager.onFrame(timeRate, actualTime)
            TargetingManager.onFrame(timeRate, actualTime)
            OnScreenMessageManager.onFrame(actualTime)
            if (!Settings.isDetalLevelLow()) {
                OverlayManager.onFrame(timeRate, actualTime)
            }
            if (GMManager.gmPanelVisible) GMManager.onFrame(timeRate, actualTime)
        }

        if (this.frame % 2 === 0) {
            if (Settings.isDetalLevelLow()) {
                OverlayManager.onFrame(timeRate, actualTime)
            }

            SelectedTargetPanel.onFrame(actualTime)
            MyStatusPanel.onFrame(actualTime)
            ActionButtonsManager.onFrame(actualTime)
            GuiButtonsManager.onFrame()
            EmeraldsManager.onFrame(actualTime)
        }

        if (this.frame % 10 === 0) {
            this.actualizeDebug()
            StepMarksRenderer.update(timeRate, actualTime)
            FightSplatsRenderer.update(timeRate, actualTime)
            StaticsManager.resolveSounds()
        }

        if (this.frame % 60 === 0) {
            MiniMap.updateMiniMap()
            WeatherManager.update()
            AudioManager.processOneFrame()
        }

        if (this.frame % 600 === 0) {
            StepMarksRenderer.updateInLocalStorage()
        }

        Connector.processMessages(actualTime)
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

    createScene(engine: Engine) {
        this.scene = new Scene(engine)
        this.scene.clearColor = new Color4(0, 0, 0)
        this.scene.imageProcessingConfiguration.exposure = 1.2
        this.scene.skipPointerMovePicking = true
        this.scene.autoClear = false
        this.scene.autoClearDepthAndStencil = false

        this.scene.fogMode = Scene.FOGMODE_LINEAR
        this.scene.fogStart = 20
        this.scene.fogEnd = 50
        this.scene.fogColor = new Color3(0.2, 0.22, 0.24)

        this.scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(
            "environment_specular.env",
            this.scene
        )
        this.brightnessChanged()
    },

    brightnessChanged() {
        if (!this.scene) {
            return
        }
        const defaultEnvironmentIntensity = 0.25 + Settings.brightness * 0.025
        this.scene.environmentIntensity = this.environmentType === 'indoor'
            ? defaultEnvironmentIntensity / 5
            : defaultEnvironmentIntensity
        this.scene.fogEnabled = this.environmentType !== 'indoor'

        this.scene.markAllMaterialsAsDirty(Material.AllDirtyFlag)
    },

    setWorldEnvironmentType(environmentType: string | null | undefined) {
        this.environmentType = environmentType === 'indoor' ? 'indoor' : 'outdoor'
        Lights.setIndoor(this.environmentType === 'indoor')
        this.brightnessChanged()
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
            cameraPosition.y += Settings.closeView ? 1 : 3

            // Raising the camera must not move it farther from the player.
            // Reduce the horizontal offset while preserving the original
            // camera-to-player distance.
            const horizontalDistance = Math.sqrt(Math.max(0, cameraDistance ** 2 - cameraPosition.y ** 2))
            const currentHorizontalDistance = Math.sqrt(cameraPosition.x ** 2 + cameraPosition.z ** 2)
            if (currentHorizontalDistance > 0) {
                const horizontalScale = horizontalDistance / currentHorizontalDistance
                cameraPosition.x *= horizontalScale
                cameraPosition.z *= horizontalScale
            }
        }

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
            document.getElementById("debug-panel")!.style.display = "none"
            this.inspectorDisplayed = true
        } else {
            Inspector.Hide()
            document.getElementById("debug-panel")!.style.display = "flex"
            this.inspectorDisplayed = false
        }
    },

    actualizeDebug() {
        const absoluteFPS = 1000 / this.instrumentation!.frameTimeCounter.lastSecAverage
        document.getElementById("fpsLabel")!.innerHTML = "FPS: " + this.fps + " | " + absoluteFPS.toFixed(0);
        document.getElementById("posLabel")!.innerHTML = "POS: " + MyPlayer.myChar.getPositionRounded().toString();
    },

    requestFullscreen() {
        if (screenFull.request) {
            screenFull.request()
        }
    }
}
