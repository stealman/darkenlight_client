import {
    Color4,
    GPUParticleSystem,
    MeshBuilder,
    ParticleSystem,
    Scene,
    Texture, Vector2,
    Vector3,
} from '@babylonjs/core'
import { MyPlayer } from '@/data/myPlayer'
import { Renderer } from '@/babylon/scene/renderer'
import { Settings } from '@/settings/settings'
export const WeatherManager = {
    actualWeather: null as WeatherEffect | null,
    enabled: true,

    initialize () {
        this.actualWeather?.stop()
        this.actualWeather = null
        this.enabled = Renderer.environmentType !== 'indoor'
    },

    setEnabled(enabled: boolean) {
        if (this.enabled === enabled) {
            return
        }
        this.enabled = enabled
        if (this.actualWeather) {
            if (enabled) {
                this.actualWeather.start()
            } else {
                this.actualWeather.stop()
            }
        }
    },

    update() {
        if (!this.enabled) {
            return
        }
        if (!this.actualWeather) {
            this.actualWeather = new SnowEffect(Renderer.scene)
            this.actualWeather.start()
        }

        this.actualWeather?.update()
    },
}

interface WeatherEffect {
    start() : void
    stop() : void
    update() : void
}

class SnowEffect implements WeatherEffect {
    snow: GPUParticleSystem

    constructor(scene: Scene) {
        //console.log("Initializing snow effect")
        let capacity = 10000
        const particleSize = new Vector2(0.02, 0.03)
        if (Settings.isDetailLevelMedium()) {
            particleSize.x = 0.03
            particleSize.y = 0.04
            capacity = 7500
        }
        if (Settings.isDetalLevelLow()) {
            particleSize.x = 0.05
            particleSize.y = 0.06
            capacity = 4000
        }

        const snow = new GPUParticleSystem("snow", {
            capacity: capacity
        }, scene);

        snow.particleTexture = new Texture("images/gfx/flare-rect.png", scene);
        snow.minEmitBox = new Vector3(-14, 5, -14);
        snow.maxEmitBox = new Vector3(16, 7, 16);

        const snowEmitter = MeshBuilder.CreateBox(
            "snowEmitter",
            { size: 0.1 },
            scene
        );
        snowEmitter.isVisible = false;
        snowEmitter.parent = MyPlayer.myModel?.node
        snow.emitter = snowEmitter;

        snow.minSize = Settings.isDetalLevelHigh() ? 0.02 : 0.03;
        snow.maxSize = Settings.isDetalLevelHigh() ? 0.065 : 0.08;

        snow.addColorGradient(0, new Color4(1, 1, 1, 0.3))
        snow.addColorGradient(1, new Color4(1, 1, 1, 0))
        snow.blendMode = ParticleSystem.BLENDMODE_ADD;

        snow.minLifeTime = 3
        snow.maxLifeTime = 3

        // speed
        snow.minEmitPower = 0.8;
        snow.maxEmitPower = 1.2;

        snow.gravity = new Vector3(0, -0.6, 0);

        const wind = new Vector3(0.8, 0, -2);
        snow.direction1.set(wind.x - 0.4, -1, wind.z - 0.4)
        snow.direction2.set(wind.x + 0.4, -1, wind.z + 0.4)

        snow.emitRate = 1000;
        snow.updateSpeed = 0.02

        snow.renderingGroupId = 2;
        this.snow = snow;
        snow.start();
    }

    start(): void {
        if (!this.snow.isStarted() || this.snow.isStopped()) {
            this.snow.start()
        }
    }
    stop(): void {
        this.snow.stop()
        this.snow.reset()
    }
    update(): void {

    }
}
