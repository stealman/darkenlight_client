import { Vector3 } from '@babylonjs/core'

/**
 * Tests a finite normalized-direction segment against an axis-aligned box.
 * Unlike Babylon's ray/box helper, intersections beyond maxDistance are rejected.
 */
export function segmentIntersectsAabb(
    origin: Vector3,
    direction: Vector3,
    maxDistance: number,
    minimum: Vector3,
    maximum: Vector3,
): boolean {
    let near = 0
    let far = maxDistance
    const origins = [origin.x, origin.y, origin.z]
    const directions = [direction.x, direction.y, direction.z]
    const minimums = [minimum.x, minimum.y, minimum.z]
    const maximums = [maximum.x, maximum.y, maximum.z]

    for (let axis = 0; axis < 3; axis++) {
        if (Math.abs(directions[axis]) < 0.000001) {
            if (origins[axis] < minimums[axis] || origins[axis] > maximums[axis]) {
                return false
            }
            continue
        }

        const inverseDirection = 1 / directions[axis]
        let axisNear = (minimums[axis] - origins[axis]) * inverseDirection
        let axisFar = (maximums[axis] - origins[axis]) * inverseDirection
        if (axisNear > axisFar) {
            const swap = axisNear
            axisNear = axisFar
            axisFar = swap
        }
        near = Math.max(near, axisNear)
        far = Math.min(far, axisFar)
        if (near > far) {
            return false
        }
    }
    return true
}
