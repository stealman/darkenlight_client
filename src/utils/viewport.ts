import { Frustum, Matrix, Vector3 } from '@babylonjs/core'
import { Renderer } from '@/babylon/scene/renderer'
import { MiniMap } from '@/utils/minimap'

export const ViewportManager = {
    viewPortInitialized: false,
    visibleTiles: [],
    visibilityMatrix: [],
    matrixSizeBonus: 4,
    yOffset: 6,

    minX: 0,
    maxX: 0,
    minZ: 0,
    maxZ: 0,

    getScreenPosition(mesh) {
        if (Renderer.scene == null || Renderer.camera == null || Renderer.engine == null) {
            return new Vector3(0, 0, 0)
        }

        return Vector3.Project(
            mesh.getAbsolutePosition(),
            Matrix.Identity(),
            Renderer.scene.getTransformMatrix(),
            Renderer.camera.viewport.toGlobal(Renderer.engine.getRenderWidth(), Renderer.engine.getRenderHeight()));
    },

    onResize() {
        const minDisplaySize = Math.min(window.innerHeight, window.innerWidth) / 4
        MiniMap.updateCanvasSize(minDisplaySize)
        this.viewPortInitialized = false
    },

    isPointInVisibleMatrix(x, z, tolerance = 0) {
        if (!this.viewPortInitialized) {
            return false
        }
        if (x < this.minX || x > this.maxX || z < this.minZ || z > this.maxZ) {
            return false
        }

        if (!ViewportManager.visibilityMatrix[x][z]) {
            if (tolerance === 0) {
                return false
            }

            // Approximate both x and z to the zero by given tolerance and check again
            const xAppr = x < 0 ? x + tolerance : x - tolerance
            const zAppr = z < 0 ? z + tolerance : z - tolerance
            if (!ViewportManager.visibilityMatrix[xAppr][zAppr]) {
                return false
            }
        }

        return true
    },

    calculateViewport(camera) {
        const borderTiles = []
        let axisDistance = 1
        let visibleTileFound = true

        while (visibleTileFound && axisDistance < 50) {
            const points = this.getSurroundingTiles(axisDistance)
            visibleTileFound = false

            for (const point of points) {
                if (this.isPointInView(point, camera!)) {
                    visibleTileFound = true
                    borderTiles.push(point)
                }

                point.y = 0
                if (this.isPointInView(point, camera!)) {
                    visibleTileFound = true
                    borderTiles.push(point)
                }

                point.y = - this.yOffset
                if (this.isPointInView(point, camera!)) {
                    visibleTileFound = true
                    borderTiles.push(point)
                }
            }
            axisDistance ++
        }

        // find min and max x and z from visible tiles
        this.minX = 0
        this.maxX = 0
        this.minZ = 0
        this.maxZ = 0
        for (const point of borderTiles) {
            if (point.x < this.minX) {
                this.minX = point.x
            }
            if (point.x > this.maxX) {
                this.maxX = point.x
            }
            if (point.z < this.minZ) {
                this.minZ = point.z
            }
            if (point.z > this.maxZ) {
                this.maxZ = point.z
            }
        }

        this.minX -= this.matrixSizeBonus
        this.maxX += this.matrixSizeBonus
        this.minZ -= this.matrixSizeBonus
        this.maxZ += this.matrixSizeBonus

        // loop through rectangular area defined by min and max x and z and find visible tiles
        this.visibleTiles = []
        for (let x = this.minX; x <= this.maxX; x++) {
            for (let z = this.minZ; z <= this.maxZ; z++) {

                // Check 3 vertical levels
                const point = new Vector3(x, this.yOffset, z)
                const point2 = new Vector3(x, -this.yOffset, z)
                const point3 = new Vector3(x, 0, z)

                if (this.isPointInView(point, camera!) || this.isPointInView(point2, camera!) || this.isPointInView(point3, camera!)) {
                    this.visibleTiles.push(point)

                    // Also push all neighboring tiles to have buffer
                    const neighbors = this.getSurroundingTiles(1)
                    for (const neighbor of neighbors) {
                        const neighborPoint = new Vector3(x + neighbor.x, this.yOffset, z + neighbor.z)
                        if (!this.visibleTiles.find(p => p.x === neighborPoint.x && p.z === neighborPoint.z)) {
                            this.visibleTiles.push(neighborPoint)
                        }
                    }
                }
            }
        }

        // create visible matrix as 2D array of boolean values
        this.visibilityMatrix = []

        // fill matrix with false values
        for (let x = this.minX; x <= this.maxX; x++) {
            this.visibilityMatrix[x] = []
            for (let z = this.minZ; z <= this.maxZ; z++) {
                this.visibilityMatrix[x][z] = false
            }
        }

        // set visible tiles to true
        for (const point of this.visibleTiles) {
            if (point.x >= this.minX && point.x <= this.maxX && point.z >= this.minZ && point.z <= this.maxZ) {
                this.visibilityMatrix[point.x][point.z] = true
            }
        }

        this.viewPortInitialized = true
    },

    getSurroundingTiles(axisDistance: number) {
        const points = []
        for (let dx = -axisDistance; dx <= axisDistance; dx += axisDistance) {
            for (let dz = -axisDistance; dz <= axisDistance; dz += axisDistance) {
                if (dx != 0 || dz != 0) {
                    points.push(new Vector3(dx, this.yOffset, dz))
                }
            }
        }
        return points
    },

    isPointInView (position, camera) {
        const frustumPlanes = Frustum.GetPlanes(camera.getTransformationMatrix());

        // Project the point on each plane and check if it's in front of it
        for (const plane of frustumPlanes) {
            if (plane.dotCoordinate(position) < 0) {
                return false
            }
        }
        return true
    }
}
