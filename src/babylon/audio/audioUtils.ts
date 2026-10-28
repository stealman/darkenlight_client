import { Vector3 } from '@babylonjs/core'
import { MyPlayer } from '@/data/myPlayer'
import { Renderer } from '@/babylon/scene/renderer'

export const AudioUtils = {

    getVolumeRatioByDistance(source: Vector3, distanceMultiplier: number = 1): number {
        const camera = Renderer.camera
        if (!camera || !MyPlayer.myModel) return 0
        const refDistance = Vector3.Distance(MyPlayer.myModel.node.position, camera.globalPosition)
        const playerPos = MyPlayer.myChar.pos
        const sourceX = playerPos.x + (source.x - playerPos.x) * distanceMultiplier
        const sourceY = playerPos.y + (source.y - playerPos.y) * distanceMultiplier
        const sourceZ = playerPos.z + (source.z - playerPos.z) * distanceMultiplier
        const cameraPos = camera.globalPosition
        const thisDistance = Math.hypot(sourceX - cameraPos.x, sourceY - cameraPos.y, sourceZ - cameraPos.z)

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

        const distToMe = Vector3.Distance(source, playerPos) * distanceMultiplier

        const screenIgnoreUntil = 10

        if (distToMe > screenIgnoreUntil) {
            const camPos = camera.globalPosition
            const toSrc = new Vector3(sourceX - camPos.x, sourceY - camPos.y, sourceZ - camPos.z).normalize()
            const forward = camera.getDirection(Vector3.Forward())

            let dot = Vector3.Dot(forward, toSrc)
            dot = Math.max(0, dot)

            const minScreen = 0.25
            screenFactor = minScreen + (1 - minScreen) * dot
        }
        return Math.max(0, m * screenFactor)
    }
}
