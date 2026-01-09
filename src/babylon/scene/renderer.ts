import {
    Engine,
    Scene,
    Vector3,
    FreeCamera,
    ShadowGenerator, Color3, Color4, SceneInstrumentation, DirectionalLight, Mesh,
    AbstractMesh, CubeTexture, DracoCompression, HighlightLayer, GlowLayer,
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
import { MonsterLoader } from '@/babylon/monsters/monsterLoader'
import { Connector } from '@/network/connector'
import { MobEquipManager } from '@/babylon/item/mobEquipManager'
import { WorldDataManager } from '@/data/worldDataManager'
import { WeatherManager } from '@/babylon/world/weather/weatherManager'
import { GMManager, GmTabs } from '@/gm/GM'
import { GMSpawns } from '@/gm/GmSpawns'
import { OverlayManager } from '@/gui/overlayManager'
import { TargetingManager } from '@/gui/targettingManager'

/**
 * Main Renderer
 */
export const Renderer = {
    initialized: false,
    scene: null as Scene,
    instrumentation: null as SceneInstrumentation | null,
    engine: null as Engine | null,
    camera: null as FreeCamera | null,

    lastPos: null as Vector3 | null,
    fps: 0 as number,
    frame: 0 as number,

    // Animations run 25 FPS
    animationFrameTime: 40 as number,
    animationSpeedRatio: 1 as number,
    animationFrame: 0 as number,
    lastFrameTime: 0 as number,
    lastAnimationFrameTime: 0 as number,

    activeMeshesFrozen: false,

    shadow: {} as ShadowGenerator,
    sunLight: {} as DirectionalLight,

    // glowLayer: null as GlowLayer,

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

        this.animationSpeedRatio = this.animationFrameTime / 25
        this.sunLight = new DirectionalLight("sunLight", new Vector3(-0.75, -0.75, 0.3), this.scene)
        this.sunLight.position = new Vector3(40, 40, 40);
        this.sunLight.intensity = 0.4
        this.sunLight.diffuse = new Color3(1, 0.91, 0.74)
        //this.sunLight.setEnabled(false)

        if (Settings.shadows) {
            this.shadow = new ShadowGenerator(4096, this.sunLight, false)
            this.shadow.bias = 0.00001
            this.shadow.setDarkness(0)
            this.shadow.usePoissonSampling = true
            this.shadow.forceBackFacesOnly = true
            //this.shadow.getShadowMap().refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE
        }

        //this.glowLayer = new GlowLayer("hl", this.scene)
        //this.glowLayer.intensity = 0.3
        //this.glowLayer.blurKernelSize = 1

        // Initialize game objects and managers
        this.instrumentation = new SceneInstrumentation(this.scene);
        this.instrumentation.captureFrameTime = true;

        AudioManager.initialize(this.scene)
        MiniMap.initialize()
        await CharEquipManager.initialize(this.scene)
        await MobEquipManager.initialize(this.scene)
        console.log("wearableManager initialized")

        await MyPlayer.initialize(this.scene)
        console.log("MyPlayer initialized")

        await MonsterManager.initialize(this.scene)
        console.log("MonsterManager initialized")

        Controller.initializeController(this.scene)
        Materials.initialize(this.scene)
        WorldRenderer.initialize(this.scene)
        WeatherManager.initialize()
        await OverlayManager.initialize()
        await TargetingManager.initialize()

        // Create the camera
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

        // Debug layer
        if (Settings.debug) {
            this.scene.debugLayer.show({
                embedMode: true
            })
            /**
            const axes = new Debug.AxesViewer(scene, 5)
            axes.xAxis.position = new Vector3(5, 0, 5)
            axes.zAxis.position = new Vector3(5, 0, 5)
            axes.yAxis.dispose()*/
        }

        this.sunLight.parent = MyPlayer.charModel!.node

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
            this.lastPos = null
        })

        this.initialized = true
    },

    addShadowCaster(mesh: Mesh | AbstractMesh) {
        if (Settings.shadows) {
            this.shadow.addShadowCaster(mesh)
        }
    },

    /**
     * Main game loop
     */
    onFrame(scene: Scene) {
        if (!this.initialized) {
            return
        }
        this.frame++
        const actualTime = new Date().getTime()
        const timeRate = (actualTime - this.lastFrameTime) / 1000

        this.fps = Number.parseInt(this.engine!.getFps()!.toFixed());
        this.actualizeDebug()

        if (this.frame > 1) {
            MyPlayer.onFrame(timeRate, actualTime)
            MonsterManager.onFrame(timeRate, actualTime, this.frame)

            if (actualTime - this.lastAnimationFrameTime >= this.animationFrameTime) {
                let timeExceeded: number = 0
                if (this.lastAnimationFrameTime > 0) {
                    timeExceeded = actualTime - this.lastAnimationFrameTime - this.animationFrameTime
                }
                MonsterManager.onAnimFrame()
                this.lastAnimationFrameTime = actualTime - timeExceeded
                this.animationFrame++
            }

            MobEquipManager.onFrame()
            TargetingManager.onFrame(timeRate, actualTime)
            OverlayManager.onFrame(timeRate, actualTime)

            if (GMManager.gmPanelVisible) {
                GMManager.onFrame(timeRate, actualTime)
            }
        }

        if (this.frame % 60 === 0) {
            MiniMap.updateMiniMap()
            WeatherManager.update()
        }

        if (this.frame % 10 === 0) {
            //Materials.onFrame(this.frame)
        }

        // If the player moved, render the world
        const pos = Data.myChar.getPositionRounded()

        if (this.lastPos == null || pos.x !== this.lastPos.x || pos.z !== this.lastPos.z) {
            if (ViewportManager.viewPortInitialized) {
                WorldDataManager.fetchWorldDataIfNeeded()
                WorldRenderer.renderWorld()
                this.lastPos = pos
            }
        }
        Connector.processMessages(actualTime)
        scene.render()

        if (!ViewportManager.viewPortInitialized) {
            ViewportManager.calculateViewport(this.camera)
            console.log("Viewport initialized")
        }

        this.lastFrameTime = actualTime
    },

    setCullingFrequency(scene: Scene, everyNFrames: number) {
        scene.freezeActiveMeshes(true)
        this.activeMeshesFrozen = true

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

        this.setCullingFrequency(this.scene, 50)

        this.scene.onAfterAnimationsObservable.add(() => {
            if (this.frame > 1) {
                CharEquipManager.onFrame()
            }
        })

        this.scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(
            "environment_specular.env",
            this.scene
        );
        this.scene.environmentIntensity = 0.4
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

export const getScene = (): Scene => {
    return Renderer.scene!;
}
