import { Matrix, Mesh, Quaternion, Scene, Vector2, Vector3 } from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import { Materials } from '@/babylon/materials'
import { WorldDataManager } from '@/data/worldDataManager'
import { ViewportManager } from '@/utils/viewport'
import { Settings } from '@/settings/settings'

export const FightSplatsRenderer = {
    splats: new Array<Splat>(),
    visibleSplats: new Array<Splat>(),
    maxSplats: 1000,
    ttl: 900000,
    splatPlane: null as Mesh | null,

    initialize (scene: Scene) {
        this.splatPlane = Builder.createHorizontalPlane(scene, null, 1, 0)
        this.splatPlane.material = Materials.fightSplatsMaterial
        this.maxSplats = Settings.isDetalLevelHigh() ? 1000 : 250
    },

    consumeSplats(data: [{ lp: number, x: number, z: number, tp: number, s: number }]) {
        for (const dt of data) {
            const block = WorldDataManager.getBlockOnPosition(new Vector3(dt.x, 0, dt.z))
            if (!block || block.shallowWater || block.deepWater) {
                continue
            }
            const pos = new Vector3(dt.x, block?.totalHeight + 0.011, dt.z)

            const splat = new Splat(FightSplatTypes.getSplatById(dt.tp), pos, dt.lp, dt.s)
            this.splats.push(splat)

            // If over max, remove oldest
            if (this.splats.length > this.maxSplats) {
                this.splats.shift()
            }
        }
    },

    removeSplats(data: [{ lp: number, x: number, z: number, tp: number, s: number }]) {
        for (const dt of data) {
            this.splats = this.splats.filter(mark => !(mark.pos.x === dt.x && mark.pos.z === dt.z))
        }
    },

    update(timeRate: number, time: number) {
        this.splats = this.splats.filter(mark => (time < mark.deadTime))
        this.updateVisibleSplats()
        this.renderStepMarks(time)
    },

    updateVisibleSplats() {
        this.visibleSplats = []
        for (const splat of this.splats) {
            if (ViewportManager.isPointInVisibleMatrix(Math.floor(splat.pos.x), Math.floor(splat.pos.z), 2)) {
                this.visibleSplats.push(splat)
            }
        }
    },

    renderStepMarks(time: number) {
        if (!this.splatPlane) return

        const buffer = new Float32Array(this.visibleSplats.length * 16)
        const uvBuffer = new Float32Array(this.visibleSplats.length * 2)
        let i = 0
        for (const mark of this.visibleSplats) {
            const posMatrix = Matrix.Translation(mark.pos.x, mark.pos.y, mark.pos.z)
            const scaleMatrix = Matrix.Scaling(mark.scale.x, 1, mark.scale.y);
            scaleMatrix.multiply(Matrix.FromQuaternionToRef(Quaternion.FromEulerAngles(0, mark.rot, 0), new Matrix()).multiply(posMatrix)).copyToArray(buffer, i * 16);

            const uvc = mark.getUvcIndex(time)
            uvBuffer[i * 2] = uvc.x
            uvBuffer[i * 2 + 1] = uvc.y
            i++
        }
        this.splatPlane.thinInstanceSetBuffer('matrix', buffer, 16)
        this.splatPlane.thinInstanceSetBuffer('uvc', uvBuffer, 2)
        this.splatPlane.thinInstanceRefreshBoundingInfo()
    }
}

export class SplatType {
    id: number
    textureRow: number
    indices: Vector2[]
    constructor(id: number, textureRow: number) {
        this.id = id
        this.textureRow = textureRow
        for (let i = 0; i < 16; i++) {
            if (!this.indices) {
                this.indices = []
            }
            this.indices.push(new Vector2(i, textureRow))
        }
    }
}

class Splat {
    pos: Vector3
    rot: number = 0
    creationTime: number
    deadTime: number = 0
    splatType: SplatType = FightSplatTypes.BLOOD
    indexOffset: number = 0
    scale: Vector2 = new Vector2(1, 1)

    constructor(type: SplatType, pos: Vector3, lifeProgress: number, scaleLevel: number) {
        this.scale = new Vector2(0.4 + Math.random() * scaleLevel * 0.1, 0.4 + Math.random() * 0.1 + scaleLevel * 0.1)
        this.splatType = type
        this.pos = pos
        this.rot = Math.random() * Math.PI * 2

        // count creation time back from life progress
        this.creationTime = Date.now() - ((lifeProgress / 100) * FightSplatsRenderer.ttl)
        this.deadTime = this.creationTime + FightSplatsRenderer.ttl
        this.indexOffset = Math.random() < 0.5 ? 0 : 8
    }

    getUvcIndex(time: number): Vector2 {
        const lifeProgress = (time - this.creationTime) / (this.deadTime - this.creationTime)
        if (lifeProgress < 0.12) {
            return this.splatType.indices[this.indexOffset]
        } else if (lifeProgress < 0.25) {
            return this.splatType.indices[this.indexOffset + 1]
        } else if (lifeProgress < 0.37) {
            return this.splatType.indices[this.indexOffset + 2]
        } else if (lifeProgress < 0.50) {
            return this.splatType.indices[this.indexOffset + 3]
        } else if (lifeProgress < 0.62) {
            return this.splatType.indices[this.indexOffset + 4]
        } else if (lifeProgress < 0.75) {
            return this.splatType.indices[this.indexOffset + 5]
        } else if (lifeProgress < 0.87) {
            return this.splatType.indices[this.indexOffset + 6]
        } else {
            return this.splatType.indices[this.indexOffset + 7]
        }
    }
}

export const FightSplatTypes = {
    BLOOD: new SplatType(1, 0),
    GREEN_BLOOD: new SplatType(2, 3),
    FLESH: new SplatType(3, 2),
    ICHOR: new SplatType(4, 3),
    BONE: new SplatType(5, 1),
    DARK_BONE: new SplatType(6, 2),
    RED_BONE: new SplatType(7, 6),
    STONE_FRAGMENTS: new SplatType(8, 7),

    getSplatById(id: number): SplatType {
        return Object.values(FightSplatTypes).find(item => typeof item !== 'function' && item.id === id) as SplatType;
    }
}


