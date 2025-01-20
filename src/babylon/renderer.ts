import {
    Engine,
    Scene,
    Vector3,
    FreeCamera,
    PointLight,
    ShadowGenerator, Color3, Color4, RenderTargetTexture, SceneInstrumentation,
} from '@babylonjs/core'
import {UnwrapRef} from "vue"
import '@babylonjs/inspector'
import {Debug} from "@babylonjs/core/Legacy/legacy"
import { Controller } from '@/controlls/controller'
import {MyPlayer} from "@/babylon/character/myPlayer"
import screenFull from 'screenfull'
import {Settings} from "@/settings/settings";
import {WorldRenderer} from "@/babylon/world/worldRenderer";
import { MiniMap } from '@/utils/minimap'
import { Materials } from '@/babylon/materials'
import { AudioManager } from '@/babylon/audio/audioManager'
import { ViewportManager } from '@/utils/viewport'
import { WearableManager } from '@/babylon/item/wearableManager'
import { MonsterManager } from '@/babylon/monsters/monsterManager'
import { Data } from '@/data/globalData'
import { MonsterLoader } from '@/babylon/monsters/monsterLoader'
import { Connector } from '@/network/connector'

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
    light: {} as PointLight,

    async initialize(canvasRef: UnwrapRef<HTMLCanvasElement>) {
        this.engine = new Engine(canvasRef, true)
        this.createScene(this.engine)

        this.animationSpeedRatio = this.animationFrameTime / 25

        this.light = new PointLight("pointLight", new Vector3(-20, 50, 15), this.scene);
        this.light.intensity = 1.0;
        this.light.diffuse = new Color3(1, 1, 1);
        this.light.range = 500;

        if (Settings.shadows) {
            this.shadow = new ShadowGenerator(2048, this.light, false);
            this.shadow.bias = 0;
            this.shadow.setDarkness(0.25);
            this.shadow.usePercentageCloserFiltering = true;
            this.shadow.filteringQuality = 2;
            this.shadow.forceBackFacesOnly = true;

            this.shadow.getShadowMap().refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE
        }

        // Initialize game objects and managers
        this.instrumentation = new SceneInstrumentation(this.scene);
        this.instrumentation.captureFrameTime = true;

        AudioManager.initialize(this.scene)
        MiniMap.initialize()
        await WearableManager.initialize(this.scene)
        console.log("wearableManager initialized")

        await MyPlayer.initialize(this.scene)
        console.log("MyPlayer initialized")

        await MonsterManager.initialize(this.scene)
        console.log("MonsterManager initialized")

        Controller.initializeController(this.scene)
        Materials.initialize(this.scene)
        WorldRenderer.initialize(this.scene, this.shadow)
        this.light.parent = WorldRenderer.worldParentNode

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
        //this.camera.maxZ = 200

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

        // Run the game loop
        this.engine.runRenderLoop(() => {
            this.onFrame(this.scene)
            this.scene.render()
        })

        window.addEventListener('resize', () => {
            this.engine?.resize()
            ViewportManager.onResize()
            this.lastPos = null
        })

        this.initialized = true
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

        this.fps = parseInt(this.engine?.getFps().toFixed());
        this.actualizeDebug()

        if (this.frame > 1) {
            MyPlayer.onFrame(timeRate, actualTime)
            MonsterManager.onFrame(timeRate, actualTime, this.frame)

            if (actualTime - this.lastAnimationFrameTime >= this.animationFrameTime) {
                let timeExceeded: number = 0
                if (this.lastAnimationFrameTime > 0) {
                    timeExceeded = actualTime - this.lastAnimationFrameTime - this.animationFrameTime
                }

                MonsterLoader.onAnimFrame(this.animationFrame)
                MonsterManager.onAnimFrame(this.animationFrame)
                this.lastAnimationFrameTime = actualTime - timeExceeded
                this.animationFrame++
            }

            WearableManager.onFrame()
        }

        if (this.frame % 150 === 0) {
            MiniMap.updateMiniMap()
        }

        const pos = Data.myChar.getPositionRounded()

        // If the player moved, render the world
        if (this.lastPos == null || pos.x !== this.lastPos.x || pos.z !== this.lastPos.z) {
            if (ViewportManager.viewPortInitialized) {
                WorldRenderer.renderWorld()
                this.lastPos = pos

                if (Settings.shadows) {
                    this.shadow.getShadowMap().refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE
                }
            }
        }
        WorldRenderer.updateWorldParentNode()
        Connector.processMessages(actualTime)

        scene.render()

        if (!ViewportManager.viewPortInitialized) {
            ViewportManager.calculateViewport(this.camera)
            console.log("Viewport initialized")
        }

        if (this.frame % 10 === 0) {
            if (!this.activeMeshesFrozen) {
                this.freezeActiveMeshes()
            }
        }

        this.lastFrameTime = actualTime
    },

    freezeActiveMeshes() {
        this.scene.freezeActiveMeshes()
        this.activeMeshesFrozen = true
    },

    unfreezeActiveMeshes() {
        this.scene.unfreezeActiveMeshes()
        this.activeMeshesFrozen = false
    },

    createScene(engine: Engine) {
        this.scene = new Scene(engine)
        this.scene.clearColor = new Color4(0.2, 0.4, 0.2)
        this.scene.imageProcessingConfiguration.exposure = 1.2
        this.scene.skipPointerMovePicking = true
        this.scene.autoClear = false
        this.scene.autoClearDepthAndStencil = false
    },

    actualizeDebug() {
        // value={1000.0 / this._sceneInstrumentation!.frameTimeCounter.lastSecAverage}
        const absoluteFPS = 1000 / this.instrumentation!.frameTimeCounter.lastSecAverage
        document.getElementById("fpsLabel").innerHTML = "FPS: " + this.fps + " | " + absoluteFPS.toFixed(0);
        document.getElementById("posLabel").innerHTML = "POS: " + Data.myChar.getPositionRounded().toString();
        document.getElementById("meshLabel").innerHTML = "MESH: " + this.scene.getActiveMeshes().length.toString() + " | DC: " + this.instrumentation!.drawCallsCounter.current.toString()
        document.getElementById("facesLabel").innerHTML = "FACE: " + (this.scene.getActiveIndices() / 3).toString();
    },

    requestFullscreen() {
        if (screenFull.request) {
            screenFull.request()
        }
    }
}
