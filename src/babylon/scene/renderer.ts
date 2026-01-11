import {
    Engine,
    Scene,
    Vector3,
    FreeCamera,
    Color3, Color4, SceneInstrumentation,
    CubeTexture, DracoCompression
} from '@babylonjs/core'
import {UnwrapRef} from "vue"
import '@babylonjs/inspector'
import { Controller } from '@/controlls/controller'
import {MyPlayer} from "@/babylon/character/myPlayer"
import screenFull from 'screenfull'
import {Settings} from "@/settings/settings";
import {WorldRenderer} from "@/babylon/world/worldRenderer";
import { MiniMap } from '@/utils/minimap'
import { Materials } from '@/babylon/materials'
import { AudioManager } from '@/babylon/audio/audioManager'
import { ViewportManager } from '@/utils/viewport'
import { CharEquipManager } from '@/babylon/item/charEquipManager'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { Data } from '@/data/globalData'
import { Connector } from '@/network/connector'
import { MobEquipManager } from '@/babylon/item/mobEquipManager'
import { WeatherManager } from '@/babylon/world/weather/weatherManager'
import { GMManager} from '@/gm/GM'
import { OverlayManager } from '@/gui/overlayManager'
import { TargetingManager } from '@/gui/targettingManager'
import { StepMarksRenderer } from '@/babylon/world/stepMarksRenderer'
import { Lights } from '@/babylon/scene/lights'
import { FightSplatsRenderer } from '@/babylon/world/fightSplatsRenderer'

/**
 * Main Renderer
 */
export const Renderer = {
    initialized: false,
    scene: null as Scene,
    instrumentation: null as SceneInstrumentation | null,
    engine: null as Engine | null,
    camera: null as FreeCamera | null,

    fps: 0 as number,
    frame: 0 as number,
    animationSpeedRatio: 1 as number,

    async initialize(canvasRef: UnwrapRef<HTMLCanvasElement>) {
        this.engine = new Engine(canvasRef, true)
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
        await CharEquipManager.initialize(this.scene)
        await MobEquipManager.initialize(this.scene)
        await MyPlayer.initialize(this.scene)
        await MonsterManager.initialize(this.scene)

        Controller.initializeController(this.scene)
        Materials.initialize(this.scene)
        WorldRenderer.initialize(this.scene)
        WeatherManager.initialize()
        StepMarksRenderer.initialize(this.scene)
        FightSplatsRenderer.initialize(this.scene)
        await OverlayManager.initialize()
        await TargetingManager.initialize()

        // Create camera
        this.createCamera()

        // Debug layer
        if (Settings.debug) {
            this.scene.debugLayer.show({
                embedMode: true
            })
        }
        Lights.sunLight.parent = MyPlayer.charModel!.node

        // Run the game loop
        this.engine.runRenderLoop(() => {
            this.onFrame(this.scene)
            this.scene.render()
        })

        window.addEventListener('resize', () => {
            this.engine?.resize()
            OverlayManager.onResize()
            ViewportManager.onResize()
            TargetingManager.prepareTargetSprite()
            WorldRenderer.lastPos = null
        })
        this.initialized = true
    },

    /**
     * Main game loop
     */
    onFrame(scene: Scene) {
        if (!this.initialized) return

        this.frame++
        const actualTime = new Date().getTime()
        const timeRate = this.engine!.getDeltaTime() / 1000
        this.fps = Number.parseInt(this.engine!.getFps()!.toFixed());

        if (this.frame > 1) {
            // Animation speeds are calculated to 60 FPS base
            this.animationSpeedRatio = timeRate * 60

            MyPlayer.onFrame(timeRate, actualTime)
            WorldRenderer.checkRenderWorld()
            MonsterManager.onFrame(timeRate, actualTime, this.frame)

            MobEquipManager.onFrame()
            TargetingManager.onFrame(timeRate, actualTime)
            OverlayManager.onFrame(timeRate, actualTime)

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
        this.scene.onAfterAnimationsObservable.add(() => {
            if (this.frame > 1) CharEquipManager.onFrame()
        })

        this.scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(
            "environment_specular.env",
            this.scene
        );
        this.scene.environmentIntensity = 0.3
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
        this.camera.parent = MyPlayer.charModel!.node
    },

    actualizeDebug() {
        const absoluteFPS = 1000 / this.instrumentation!.frameTimeCounter.lastSecAverage
        document.getElementById("fpsLabel")!.innerHTML = "FPS: " + this.fps + " | " + absoluteFPS.toFixed(0);
        document.getElementById("posLabel")!.innerHTML = "POS: " + Data.myChar.getPositionRounded().toString();
    },

    requestFullscreen() {
        if (screenFull.request) {
            screenFull.request()
        }
    }
}
