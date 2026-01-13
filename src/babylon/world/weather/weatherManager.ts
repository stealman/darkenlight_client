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
    actualWeather: null as WeatherEffect | null,

    initialize () {

    },

    update() {
        /**
        if (!this.actualWeather && !Settings.isDetalLevelLow()) {
            this.actualWeather = new SnowEffect(Renderer.scene)
            this.actualWeather.start()
        }

        this.actualWeather?.update()*/
    },
}

interface WeatherEffect {
    start() : void
    stop() : void
    update() : void
}

class SnowEffect implements WeatherEffect {
    constructor(scene: Scene) {
        console.log("Initializing snow effect")
        const snow = new GPUParticleSystem("snow", {
            capacity: Settings.isDetalLevelHigh() ? 25000 : 12500
        }, scene);

        snow.particleTexture = new Texture("images/gfx/flare-rect.png", scene);
        snow.minEmitBox = new Vector3(-20, 5, -20);
        snow.maxEmitBox = new Vector3(20, 7, 20);

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

        snow.minLifeTime = 2
        snow.maxLifeTime = 2

        // speed
        snow.minEmitPower = 0.8;
        snow.maxEmitPower = 1.2;

        snow.gravity = new Vector3(0, -0.6, 0);

        const wind = new Vector3(0.8, 0, -2);
        snow.direction1.set(wind.x - 0.4, -1, wind.z - 0.4)
        snow.direction2.set(wind.x + 0.4, -1, wind.z + 0.4)

        snow.emitRate = 1000;

        snow.renderingGroupId = 2;
        snow.start();
    }

    start(): void {

    }
    stop(): void {

    }
    update(): void {

    }
}
