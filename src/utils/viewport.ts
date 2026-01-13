import { Frustum, Matrix, Vector3 } from '@babylonjs/core'
import { Renderer } from '@/babylon/scene/renderer'
import { MiniMap } from '@/utils/minimap'
import { MyPlayer } from '@/data/myPlayer'

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

    viewportWidth: 0,
    viewportHeight: 0,

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
        const minDisplaySize = Math.min(window.innerHeight, window.innerWidth) / 6
        MiniMap.updateCanvasSize(minDisplaySize)
        this.viewPortInitialized = false

        this.viewportWidth = window.innerWidth
        this.viewportHeight = window.innerHeight
    },

    isPointInVisibleMatrix(x, z, tolerance = 0) {
        if (!this.viewPortInitialized) {
            return false
        }

        const myPos = MyPlayer.myChar.getPositionRounded()
        x -= myPos.x
        z -= myPos.z

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
        const myPos = MyPlayer.myChar.getPositionRounded()

        while (visibleTileFound && axisDistance < 50) {
            const points = this.getSurroundingTiles(myPos, axisDistance)
            visibleTileFound = false

            for (const point of points) {
                point.y = myPos.y + this.yOffset
                if (this.isPointInView(point, camera!)) {
                    visibleTileFound = true
                    borderTiles.push(point)
                }

                point.y = myPos.y
                if (this.isPointInView(point, camera!)) {
                    visibleTileFound = true
                    borderTiles.push(point)
                }

                point.y = myPos.y - this.yOffset
                if (this.isPointInView(point, camera!)) {
                    visibleTileFound = true
                    borderTiles.push(point)
                }
            }
            axisDistance ++
        }

        //console.log("BORDER TILES FOUND: " + borderTiles.length)

        // find min and max x and z from visible tiles
        this.minX = myPos.x
        this.maxX = myPos.x
        this.minZ = myPos.z
        this.maxZ = myPos.z

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

        //console.log('Viewport tiles X: ' + this.minX + ' to ' + this.maxX + ' Z: ' + this.minZ + ' to ' + this.maxZ)

        // loop through rectangular area defined by min and max x and z and find visible tiles
        this.visibleTiles = []
        for (let x = this.minX; x <= this.maxX; x++) {
            for (let z = this.minZ; z <= this.maxZ; z++) {

                // Check 3 vertical levels
                const point = new Vector3(x, myPos.y + this.yOffset, z)
                const point2 = new Vector3(x, myPos.y -this.yOffset, z)
                const point3 = new Vector3(x, myPos.y, z)

                if (this.isPointInView(point, camera!) || this.isPointInView(point2, camera!) || this.isPointInView(point3, camera!)) {
                    this.visibleTiles.push(point)

                    // Also push all neighboring tiles to have buffer
                    const neighbors = this.getSurroundingTiles(Vector3.Zero(), 1)
                    for (const neighbor of neighbors) {
                        const neighborPoint = new Vector3(x + neighbor.x, myPos.y - this.yOffset, z + neighbor.z)
                        if (!this.visibleTiles.find(p => p.x === neighborPoint.x && p.z === neighborPoint.z)) {
                            this.visibleTiles.push(neighborPoint)
                        }
                    }
                }
            }
        }

        console.log(this.visibleTiles.length + ' visible tiles found in viewport')

        // create visible matrix as 2D array of boolean values
        this.visibilityMatrix = []

        // fill matrix with false values
        for (let x = this.minX - myPos.x; x <= this.maxX - myPos.x; x++) {
            this.visibilityMatrix[x] = []
            for (let z = this.minZ - myPos.z; z <= this.maxZ - myPos.z; z++) {
                this.visibilityMatrix[x][z] = false
            }
        }

        // set visible tiles to true
        for (const point of this.visibleTiles) {
            if (point.x >= this.minX && point.x <= this.maxX && point.z >= this.minZ && point.z <= this.maxZ) {
                this.visibilityMatrix[point.x - myPos.x][point.z - myPos.z] = true
            }
        }

        this.viewPortInitialized = true

        this.minX -= myPos.x
        this.maxX -= myPos.x
        this.minZ -= myPos.z
        this.maxZ -= myPos.z

        //console.log('Viewport tiles X: ' + this.minX + ' to ' + this.maxX + ' Z: ' + this.minZ + ' to ' + this.maxZ)
        //console.log(this.visibilityMatrix)
    },

    getSurroundingTiles(source: Vector3, axisDistance: number) {
        const points = []

        for (let dx = source.x - axisDistance; dx <= source.x + axisDistance; dx += axisDistance) {
            for (let dz = source.z - axisDistance; dz <= source.z + axisDistance; dz += axisDistance) {
                if (dx != source.x || dz != source.z) {
                    points.push(new Vector3(dx, 0, dz))
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
    },

    getPositionOnScreen(pos: Vector3): Vector3 | null {
        const scene = Renderer.scene
        const engine = Renderer.engine!
        const camera = Renderer.camera!

        const camSpacePos = Vector3.TransformCoordinates(pos, camera.getViewMatrix())
        if (camSpacePos.z <= 0) {
            return null
        }

        return Vector3.Project(
            pos, Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
        )
    }
}
