import {
    Color4,
    GPUParticleSystem,
    MeshBuilder,
    ParticleSystem,
    Scene,
    Texture,
    Vector3,
} from '@babylonjs/core'
import { MyPlayer } from '@/data/myPlayer'
import { Renderer } from '@/babylon/scene/renderer'
import { Settings } from '@/settings/settings'
export const WeatherManager = {
    actualWeather: null as SnowEffect | null,
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
        } else if (enabled && MyPlayer.myModel) this.prepare()
    },

    prepare() {
        if (this.enabled && !this.actualWeather) {
            this.actualWeather = new SnowEffect(Renderer.scene)
        }
    },
}

class SnowEffect {
    snow: GPUParticleSystem

    constructor(scene: Scene) {
        const capacity = Settings.isDetalLevelLow() ? 3400 : Settings.isDetailLevelMedium() ? 6400 : 8500

        const snow = new GPUParticleSystem("snow", {
            capacity: capacity
        }, scene);

        snow.particleTexture = new Texture("images/gfx/flare-rect.png", scene);
        snow.minEmitBox = new Vector3(-13, 5, -13);
        snow.maxEmitBox = new Vector3(13, 7, 13);

        const snowEmitter = MeshBuilder.CreateBox(
            "snowEmitter",
            { size: 0.1 },
            scene
        );
        snowEmitter.isVisible = false;
        snowEmitter.parent = MyPlayer.myModel?.node ?? null
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
}
