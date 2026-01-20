import { Vector3 } from '@babylonjs/core'
import { MyPlayer } from '@/data/myPlayer'
import { Renderer } from '@/babylon/scene/renderer'

export const AudioUtils = {

    getVolumeRatioByDistance(source: Vector3): number {
        const refDistance = Vector3.Distance(MyPlayer.myModel!.node.position, Renderer.camera.globalPosition)
        const thisDistance = Vector3.Distance(source, Renderer.camera.globalPosition)

        const delta = thisDistance - refDistance
        const fallIntensity = 0.065
        const boostIntensity = 0.04
        const maxBoost = 1.5

        let m = 1

        if (delta > 0) {
            m = 1 - delta * fallIntensity
        } else {
            m = 1 + (-delta) * boostIntensity
        }

        m = Math.max(0, Math.min(m, maxBoost))
        let screenFactor = 1

        const distToMe = Vector3.Distance(source, MyPlayer.myChar.pos)

        const screenIgnoreUntil = 10

        if (distToMe > screenIgnoreUntil) {
            const camPos = Renderer.camera.globalPosition
            const toSrc = source.subtract(camPos).normalize()
            const forward = Renderer.camera.getDirection(Vector3.Forward())

            let dot = Vector3.Dot(forward, toSrc)
            dot = Math.max(0, dot)

            const minScreen = 0.25
            screenFactor = minScreen + (1 - minScreen) * dot
        }
        return Math.max(0, m * screenFactor)
    }
}
