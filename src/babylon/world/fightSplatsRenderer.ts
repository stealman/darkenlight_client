import { Matrix, Mesh, Quaternion, Scene, Vector2, Vector3 } from '@babylonjs/core'
import { Builder } from '@/babylon/builder'
import { Materials } from '@/babylon/materials'
import { WorldDataManager } from '@/data/worldDataManager'
import { ViewportManager } from '@/utils/viewport'
import { Settings } from '@/settings/settings'
import { MyPlayer } from '@/data/myPlayer'

export const FightSplatsRenderer = {
    splats: new Array<Splat>(),
    visibleSplats: new Array<Splat>(),
    maxSplats: 1000,
    ttl: 900000,
    splatPlane: null as Mesh | null,
    matrixBuffer: new Float32Array(0),
    uvBuffer: new Float32Array(0),
    matricesDirty: true,
    tmpPosition: new Matrix(),
    tmpRotation: new Matrix(),
    tmpWorld: new Matrix(),
    tmpQuaternion: new Quaternion(),

    initialize (scene: Scene) {
        this.splatPlane = Builder.createHorizontalPlane(scene, null, 1, 0)
        this.splatPlane.material = Materials.fightSplatsMaterial
        this.maxSplats = Settings.isDetalLevelHigh() ? 1000 : 250
    },

    consumeSplats(data: [{ lp: number, x: number, z: number, tp: number, s: number }]) {
        let changed = false
        for (const dt of data) {
            const block = WorldDataManager.getBlockOnPosition(new Vector3(dt.x, 0, dt.z))
            if (!block || block.shallowWater || block.deepWater) {
                continue
            }
            const pos = new Vector3(dt.x, block?.totalHeight + 0.011, dt.z)

            const splat = new Splat(FightSplatTypes.getSplatById(dt.tp), pos, dt.lp, dt.s)
            this.splats.push(splat)
            changed = true

            // If over max, remove oldest
            if (this.splats.length > this.maxSplats) {
                this.splats.shift()
            }
        }
        if (changed) {
            this.matricesDirty = true
        }
    },

    removeSplats(data: [{ lp: number, x: number, z: number, tp: number, s: number }]) {
        let changed = false
        for (const dt of data) {
            for (let index = this.splats.length - 1; index >= 0; index--) {
                const splat = this.splats[index]
                if (splat.pos.x === dt.x && splat.pos.z === dt.z) {
                    this.splats.splice(index, 1)
                    changed = true
                }
            }
        }
        if (changed) {
            this.matricesDirty = true
        }
    },

    clearWorld() {
        this.splats = []
        this.visibleSplats = []
        this.matricesDirty = true
        this.renderStepMarks(Date.now())
    },

    update(timeRate: number, time: number) {
        void timeRate
        if (this.removeExpiredSplats(time)) {
            this.matricesDirty = true
        }
        this.updateVisibleSplats()
        this.renderStepMarks(time)
    },

    updateVisibleSplats() {
        const playerPosition = MyPlayer.myChar?.pos
        const playerX = playerPosition == null ? 0 : Math.round(playerPosition.x)
        const playerZ = playerPosition == null ? 0 : Math.round(playerPosition.z)
        let visibleCount = 0
        for (const splat of this.splats) {
            if (this.isSplatVisible(splat, playerX, playerZ)) {
                if (this.visibleSplats[visibleCount] !== splat) {
                    this.matricesDirty = true
                }
                this.visibleSplats[visibleCount] = splat
                visibleCount++
            }
        }
        if (this.visibleSplats.length !== visibleCount) {
            this.visibleSplats.length = visibleCount
            this.matricesDirty = true
        }
    },

    renderStepMarks(time: number) {
        if (!this.splatPlane) return

        const splatCount = this.visibleSplats.length
        if (this.matricesDirty) {
            this.matrixBuffer = new Float32Array(splatCount * 16)
            this.uvBuffer = new Float32Array(splatCount * 2)
            for (let index = 0; index < splatCount; index++) {
                const splat = this.visibleSplats[index]
                this.writeSplatMatrix(splat, index)
                this.writeSplatUvc(splat, index, time)
            }
            this.splatPlane.thinInstanceSetBuffer('matrix', this.matrixBuffer, 16, false)
            this.splatPlane.thinInstanceSetBuffer('uvc', this.uvBuffer, 2, false)
            this.splatPlane.thinInstanceCount = splatCount
            this.splatPlane.setEnabled(splatCount > 0)
            if (splatCount > 0) {
                this.splatPlane.thinInstanceRefreshBoundingInfo()
            }
            this.matricesDirty = false
            return
        }

        let uvChanged = false
        for (let index = 0; index < splatCount; index++) {
            uvChanged = this.updateSplatUvc(this.visibleSplats[index], index, time) || uvChanged
        }
        if (uvChanged) {
            this.splatPlane.thinInstanceBufferUpdated('uvc')
        }
    },

    removeExpiredSplats(time: number): boolean {
        let changed = false
        for (let index = this.splats.length - 1; index >= 0; index--) {
            if (time >= this.splats[index].deadTime) {
                this.splats.splice(index, 1)
                changed = true
            }
        }
        return changed
    },

    isSplatVisible(splat: Splat, playerX: number, playerZ: number): boolean {
        if (!ViewportManager.viewPortInitialized) {
            return false
        }
        const relativeX = Math.floor(splat.pos.x) - playerX
        const relativeZ = Math.floor(splat.pos.z) - playerZ
        if (relativeX < ViewportManager.minX || relativeX > ViewportManager.maxX || relativeZ < ViewportManager.minZ || relativeZ > ViewportManager.maxZ) {
            return false
        }
        if (ViewportManager.visibilityMatrix[relativeX]?.[relativeZ]) {
            return true
        }
        const tolerance = 2
        const approximateX = relativeX < 0 ? relativeX + tolerance : relativeX - tolerance
        const approximateZ = relativeZ < 0 ? relativeZ + tolerance : relativeZ - tolerance
        return ViewportManager.visibilityMatrix[approximateX]?.[approximateZ] === true
    },

    writeSplatMatrix(splat: Splat, index: number) {
        Matrix.TranslationToRef(splat.pos.x, splat.pos.y, splat.pos.z, this.tmpPosition)
        Quaternion.FromEulerAnglesToRef(0, splat.rot, 0, this.tmpQuaternion)
        Matrix.FromQuaternionToRef(this.tmpQuaternion, this.tmpRotation)
        this.tmpRotation.multiplyToRef(this.tmpPosition, this.tmpWorld)
        Matrix.ScalingToRef(splat.scale.x, 1, splat.scale.y, this.tmpPosition)
        this.tmpPosition.multiplyToRef(this.tmpWorld, this.tmpWorld)
        this.tmpWorld.copyToArray(this.matrixBuffer, index * 16)
    },

    writeSplatUvc(splat: Splat, index: number, time: number) {
        const uvc = splat.getUvcIndex(time)
        const offset = index * 2
        this.uvBuffer[offset] = uvc.x
        this.uvBuffer[offset + 1] = uvc.y
    },

    updateSplatUvc(splat: Splat, index: number, time: number): boolean {
        const uvc = splat.getUvcIndex(time)
        const offset = index * 2
        if (this.uvBuffer[offset] === uvc.x && this.uvBuffer[offset + 1] === uvc.y) {
            return false
        }
        this.uvBuffer[offset] = uvc.x
        this.uvBuffer[offset + 1] = uvc.y
        return true
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


