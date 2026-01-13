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
import { Connector } from '@/network/connector'
import { EquipManager } from '@/babylon/item/equipManager'
import { WeatherManager } from '@/babylon/world/weather/weatherManager'
import { GMManager} from '@/gm/GM'
import { OverlayManager } from '@/gui/overlayManager'
import { TargetingManager } from '@/gui/targettingManager'
import { StepMarksRenderer } from '@/babylon/world/stepMarksRenderer'
import { Lights } from '@/babylon/scene/lights'
import { FightSplatsRenderer } from '@/babylon/world/fightSplatsRenderer'
import { OnScreenMessageManager } from '@/gui/onScreenMessageManager'
import { CharacterManager } from '@/babylon/character/characterManager'

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
    pendingMatFreeze: false as boolean,


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

        // Initialize game objects and managers
        this.instrumentation = new SceneInstrumentation(this.scene);
        this.instrumentation.captureFrameTime = true;

        Lights.initialize(this.scene)
        AudioManager.initialize(this.scene)
        MiniMap.initialize()
        CharacterManager.initialize()
        await EquipManager.initialize(this.scene)
        await MonsterManager.initialize()

        Controller.initializeController(this.scene)
        Materials.initialize(this.scene)
        WorldRenderer.initialize(this.scene)
        WeatherManager.initialize()
        StepMarksRenderer.initialize(this.scene)
        FightSplatsRenderer.initialize(this.scene)
        await OverlayManager.initialize()
        await TargetingManager.initialize()

        // Debug layer
        if (true) {
            this.scene.debugLayer.show({
                embedMode: true
            })
        }
    },

    gameStarted() {
        Lights.sunLight.parent = MyPlayer.myModel!.node
        this.engine!.runRenderLoop(() => {
            this.onFrame(this.scene)
            this.scene.render()
        })
    },

    gameStopped() {
        this.engine!.stopRenderLoop()
        this.scene.dispose()
        this.camera?.dispose()
        this.camera = null
        this.engine?.dispose()
        this.initialize(this.canvas!)
    },

    /**
     * Main game loop
     */
    onFrame(scene: Scene) {
        this.frame++
        const actualTime = new Date().getTime()
        const timeRate = this.engine!.getDeltaTime() / 1000
        this.fps = Number.parseInt(this.engine!.getFps()!.toFixed());

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
            MonsterManager.onFrame(timeRate, actualTime, this.frame)

            EquipManager.onFrame()
            TargetingManager.onFrame(timeRate, actualTime)
            OverlayManager.onFrame(timeRate, actualTime)
            OnScreenMessageManager.onFrame(actualTime)

            if (GMManager.gmPanelVisible) GMManager.onFrame(timeRate, actualTime)
        }

        if (this.frame % 10 === 0) {
            this.actualizeDebug()
            StepMarksRenderer.update(timeRate, actualTime)
            FightSplatsRenderer.update(timeRate, actualTime)
        }

        if (this.frame % 60 === 0) {
            MiniMap.updateMiniMap()
            WeatherManager.update()
        }

        if (this.frame % 600 === 0) {
            StepMarksRenderer.updateInLocalStorage()
        }

        Connector.processMessages(actualTime)
        scene.render()

        if (!ViewportManager.viewPortInitialized) ViewportManager.calculateViewport(this.camera)
    },

    setCullingFrequency(scene: Scene, everyNFrames: number) {
        scene.freezeActiveMeshes(true)

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

        this.setCullingFrequency(this.scene, 30)
        this.scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(
            "environment_specular.env",
            this.scene
        )
        this.brightnessChanged()
    },

    brightnessChanged() {
        Materials.unFreezeAll()
        this.scene.environmentIntensity = 0.2 + Settings.brightness * 0.02

        this.scene.markAllMaterialsAsDirty(Material.MiscDirtyFlag)
        if (!this.pendingMatFreeze) {
            this.pendingMatFreeze = true
            this.scene.onAfterRenderObservable.addOnce(() => {
                Materials.freezeAll()
                this.pendingMatFreeze = false
            })
        }
    },

    createCamera() {
        let cameraPosition = new Vector3(-12, 12, -12)
        if (Settings.touchEnabled) {
            cameraPosition = new Vector3(-10, 12, -10)
        }
        let cameraViewY = -2
        if (Settings.closeView) {
            cameraPosition.x = -6
            cameraPosition.y = 6
            cameraPosition.z = -6
            cameraViewY = 0
        }

        this.camera = new FreeCamera('camera1', cameraPosition, this.scene)
        this.camera.setTarget(new Vector3(0, cameraViewY, 0))
        this.camera.parent = MyPlayer.myModel!.node
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
