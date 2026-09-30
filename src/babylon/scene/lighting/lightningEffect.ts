import { Color3, DirectionalLight, Scene } from '@babylonjs/core'

const LIGHTNING_DURATION_MS = 720
const ENVIRONMENT_FLASH_FACTOR = 1.35
const DIRECTIONAL_FLASH_FACTOR = 1.15
const LIGHTNING_COLOR = new Color3(0.72, 0.82, 1)
const LIGHTNING_FOG_COLOR = new Color3(0.32, 0.4, 0.56)

export const LightningEffect = {
    startedAt: -1,

    trigger() {
        this.startedAt = performance.now()
    },

    apply(sunLight: DirectionalLight, scene: Scene, fullSunIntensity: number, fullEnvironmentIntensity: number) {
        if (this.startedAt < 0) {
            return
        }

        const elapsed = performance.now() - this.startedAt
        if (elapsed >= LIGHTNING_DURATION_MS) {
            this.startedAt = -1
            return
        }

        const factor = getFlashFactor(elapsed)
        if (factor <= 0) {
            return
        }

        // Add the flash over the already resolved day/night values. The next
        // frame rebuilds those base values, so no brightness can accumulate.
        scene.environmentIntensity += fullEnvironmentIntensity * ENVIRONMENT_FLASH_FACTOR * factor
        sunLight.intensity += fullSunIntensity * DIRECTIONAL_FLASH_FACTOR * factor

        blendColor(sunLight.diffuse, LIGHTNING_COLOR, factor * 0.9)
        sunLight.specular.copyFrom(sunLight.diffuse)
        blendColor(scene.fogColor, LIGHTNING_FOG_COLOR, factor * 0.72)
    },
}

function getFlashFactor(elapsed: number): number {
    // An abrupt primary strike, a short dark gap, a weaker return stroke and
    // a small after-flash. Linear segments keep this allocation-free per frame.
    if (elapsed < 35) return 1
    if (elapsed < 95) return interpolate(1, 0.12, (elapsed - 35) / 60)
    if (elapsed < 145) return interpolate(0.12, 0, (elapsed - 95) / 50)
    if (elapsed < 180) return interpolate(0, 0.75, (elapsed - 145) / 35)
    if (elapsed < 270) return interpolate(0.75, 0.08, (elapsed - 180) / 90)
    if (elapsed < 330) return interpolate(0.08, 0.38, (elapsed - 270) / 60)
    return interpolate(0.38, 0, (elapsed - 330) / (LIGHTNING_DURATION_MS - 330))
}

function interpolate(from: number, to: number, progress: number): number {
    return from + ((to - from) * progress)
}

function blendColor(target: Color3, color: Color3, amount: number) {
    target.set(
        target.r + ((color.r - target.r) * amount),
        target.g + ((color.g - target.g) * amount),
        target.b + ((color.b - target.b) * amount),
    )
}
