import { Color4, Matrix, Mesh, Quaternion, Scene, Sprite, SpriteManager, Vector2, Vector3 } from '@babylonjs/core'
import { ViewportManager } from '@/utils/viewport'
import { Item } from '@/data/items/item'
import { Utils } from '@/utils/utils'
import { EquipManager } from '@/babylon/item/equipManager'
import { EquipCbItem } from '@/babylon/item/codebook/equipCbItem'
import { MyPlayer } from '@/data/myPlayer'
import { GroundItemTO } from '@/network/messageIfs'

export const GroundItemsManager = {
    scene: null as Scene | null,
    itemTypes: new Map<number, GroundItemType>(),
    items: new Array<GroundItem>(),
    visibleItems: new Array<GroundItem>(),

    tmpPos: new Matrix(),
    tmpRot: new Matrix(),
    tmpWorld: new Matrix(),
    tmpQuat: Quaternion.Identity(),
    tmpVisibleItemIds: new Set<number>(),

    spriteManager: null as SpriteManager | null,
    fxParticles: new Array<GroundItemFxParticle>(),
    lastFxUpdateTime: 0,

    ITEM_BOX_SIZE: 0.2,
    ITEM_Y_OFFSET: 0.15,
    ITEM_ROTATION_X: -Math.PI / 2,

    FX_POOL_LIMIT: 250,
    FX_TARGET_PER_ITEM: 5,
    FX_LIFE_MIN: 0.75,
    FX_LIFE_MAX: 1.5,
    FX_SPAWN_XZ_RANGE: 0.4,
    FX_SPAWN_Y_MIN: 0.2,
    FX_SPAWN_Y_MAX: 0.6,
    FX_FADE_IN_RATIO: 0.5,
    FX_FADE_OUT_RATIO: 0.5,
    FX_PARTICLE_SIZE: 0.4,
    yellow_fx: new Color4(0.8, 0.6, 0.3, 1),
    PROXIMITY_RANGE_XZ: 1,
    nearbyItem: null as GroundItem | null,

    initialize(scene: Scene) {
        this.scene = scene
        this.itemTypes.clear()
        this.fxParticles = []
        this.lastFxUpdateTime = 0

        EquipManager.itemTypes.forEach((equipType, modelId) => {
            if (!equipType.mesh) {
                return
            }

            const sourceMesh = equipType.mesh
            const groundMesh = new Mesh(`ground-item-${modelId}`, scene)
            const groundGeometry = sourceMesh.geometry?.copy(`ground-item-geo-${modelId}`)
            groundGeometry?.applyToMesh(groundMesh)
            groundMesh.material = sourceMesh.material
            groundMesh.position.copyFrom(sourceMesh.position)
            groundMesh.rotation.copyFrom(sourceMesh.rotation)
            groundMesh.scaling.copyFrom(sourceMesh.scaling)
            if (sourceMesh.rotationQuaternion) {
                groundMesh.rotationQuaternion = sourceMesh.rotationQuaternion.clone()
            }

            groundMesh.setEnabled(false)
            groundMesh.alwaysSelectAsActiveMesh = true
            groundMesh.isPickable = false
            groundMesh.receiveShadows = true
            groundMesh.thinInstanceCount = 0

            this.itemTypes.set(modelId, new GroundItemType(modelId, equipType.cbData, groundMesh))
        })

        this.initializeItemFx(scene)
    },

    addItems(data: GroundItemTO[]) {
        for (const gitem of data) {

            const y = Utils.calculateYPos(gitem.pos.x, gitem.pos.z, this.ITEM_BOX_SIZE) + this.ITEM_Y_OFFSET
            const item = new GroundItem(Item.fromData(gitem.item), new Vector3(gitem.pos.x, y, gitem.pos.z))
            this.items.push(item)
        }
    },

    removeItems(data: number[]) {
        for (const id of data) {
            const index = this.items.findIndex(i => i.item.id === id)
            if (index !== -1) {
                this.items.splice(index, 1)
            }
        }
    },

    onFrame(timeRate: number, time: number) {
        this.updateVisibleItems()
        this.detectNearestItemProximity()
        for (const item of this.items) {
            item.onFrame(timeRate, time)
        }
        this.renderItems(time)
        this.updateItemFx(time)
    },

    updateVisibleItems() {
        this.visibleItems = []
        for (const item of this.items) {
            if (ViewportManager.isPointInVisibleMatrix(Math.floor(item.pos.x), Math.floor(item.pos.z), 2)) {
                this.visibleItems.push(item)
            }
        }
    },

    renderItems(time: number) {
        void time
        const itemsByType = new Map<GroundItemType, Array<GroundItem>>()

        for (const item of this.visibleItems) {
            const type = this.itemTypes.get(item.item.modelId)
            if (!type) {
                continue
            }

            if (!itemsByType.has(type)) {
                itemsByType.set(type, [])
            }
            itemsByType.get(type)!.push(item)
        }

        this.itemTypes.forEach((type) => {
            const typeItems = itemsByType.get(type) || []
            type.updateCount(typeItems.length)
            if (!type.mesh || typeItems.length === 0) {
                return
            }

            type.ensureThinBuffers(type)
            let i = 0
            for (const item of typeItems) {
                const itemY = item.pos.y + item.yOffset
                Matrix.TranslationToRef(item.pos.x, itemY, item.pos.z, this.tmpPos)
                Quaternion.FromEulerAnglesToRef(this.ITEM_ROTATION_X, item.rotationY, 0, this.tmpQuat)
                Matrix.FromQuaternionToRef(this.tmpQuat, this.tmpRot)
                this.tmpRot.multiplyToRef(this.tmpPos, this.tmpWorld)

                this.tmpWorld.copyToArray(type.instanceBuffer, i * 16)
                type.uvBuffer[i * 2] = item.matVector.x
                type.uvBuffer[i * 2 + 1] = item.matVector.y
                i++
            }

            type.mesh.thinInstanceCount = i
            type.mesh.thinInstanceBufferUpdated('matrix')
            type.mesh.thinInstanceBufferUpdated('uvc')
            type.mesh.thinInstanceRefreshBoundingInfo()
        })
    },

    initializeItemFx(scene: Scene) {
        this.spriteManager = new SpriteManager(
            'ground-item-fx-sprites',
            'images/gfx/flare-star.png',
            this.FX_POOL_LIMIT,
            36,
            scene
        )
        this.spriteManager.blendMode = 1

        for (let i = 0; i < this.FX_POOL_LIMIT; i++) {
            const sprite = new Sprite(`ground-item-fx-${i}`, this.spriteManager)
            sprite.isVisible = false
            sprite.size = this.FX_PARTICLE_SIZE
            sprite.color = new Color4(this.yellow_fx.r, this.yellow_fx.g, this.yellow_fx.b, this.yellow_fx.a)
            this.fxParticles.push(new GroundItemFxParticle(sprite))
        }
    },

    updateItemFx(time: number) {
        if (!this.spriteManager || this.fxParticles.length === 0) {
            return
        }

        if (this.lastFxUpdateTime === 0) {
            this.lastFxUpdateTime = time
            return
        }

        const dt = Math.min((time - this.lastFxUpdateTime) / 1000, 0.2)
        this.lastFxUpdateTime = time

        this.tmpVisibleItemIds.clear()
        for (const item of this.visibleItems) {
            this.tmpVisibleItemIds.add(item.item.id)
        }

        const activePerItem = new Map<number, number>()
        for (const particle of this.fxParticles) {
            if (!particle.active) {
                continue
            }

            if (!this.tmpVisibleItemIds.has(particle.ownerItemId)) {
                particle.life = 0
                continue
            }

            activePerItem.set(particle.ownerItemId, (activePerItem.get(particle.ownerItemId) || 0) + 1)
        }

        const visibleCount = this.visibleItems.length
        const targetPerItem = visibleCount > 0 ? Math.max(1, Math.min(this.FX_TARGET_PER_ITEM, Math.floor(this.FX_POOL_LIMIT / visibleCount))) : 0

        if (targetPerItem > 0) {
            for (const item of this.visibleItems) {
                const itemId = item.item.id
                let toSpawn = targetPerItem - (activePerItem.get(itemId) || 0)
                while (toSpawn > 0) {
                    if (!this.spawnFxParticle(item)) {
                        break
                    }
                    toSpawn--
                }
            }
        }

        for (const particle of this.fxParticles) {
            if (!particle.active) {
                continue
            }

            particle.life -= dt
            if (particle.life <= 0) {
                particle.deactivate()
                continue
            }

            const lifeRatio = particle.life / particle.maxLife
            const ageRatio = 1 - lifeRatio

            const fadeIn = this.FX_FADE_IN_RATIO > 0 ? Math.min(1, ageRatio / this.FX_FADE_IN_RATIO) : 1
            const fadeOut = this.FX_FADE_OUT_RATIO > 0 ? Math.min(1, lifeRatio / this.FX_FADE_OUT_RATIO) : 1
            const alphaFactor = Math.min(fadeIn, fadeOut)

            particle.sprite.color.a = this.yellow_fx.a * alphaFactor
        }
    },

    spawnFxParticle(item: GroundItem): boolean {
        for (const particle of this.fxParticles) {
            if (particle.active) {
                continue
            }

            const xOffset = (Math.random() * 2 - 1) * this.FX_SPAWN_XZ_RANGE
            const zOffset = (Math.random() * 2 - 1) * this.FX_SPAWN_XZ_RANGE
            const yOffset = this.FX_SPAWN_Y_MIN + Math.random() * (this.FX_SPAWN_Y_MAX - this.FX_SPAWN_Y_MIN)

            particle.active = true
            particle.ownerItemId = item.item.id
            particle.maxLife = this.FX_LIFE_MIN + Math.random() * (this.FX_LIFE_MAX - this.FX_LIFE_MIN)
            particle.life = particle.maxLife

            particle.position.set(
                item.pos.x + xOffset,
                item.pos.y + yOffset,
                item.pos.z + zOffset
            )

            particle.sprite.position.copyFrom(particle.position)
            particle.sprite.isVisible = true
            particle.sprite.color.set(this.yellow_fx.r, this.yellow_fx.g, this.yellow_fx.b, 0)
            particle.sprite.size = this.FX_PARTICLE_SIZE
            particle.sprite.angle = Math.random() * Math.PI * 2
            return true
        }
        return false
    },

    detectNearestItemProximity() {
        const myPos = MyPlayer.myChar?.pos
        if (!myPos || this.items.length === 0) {
            this.setNearbyItem(null)
            return
        }

        let nearest: GroundItem | null = null
        let nearestDist = 9999

        for (const item of this.items) {
            const dist = Vector3.Distance(myPos, item.pos)
            if (dist <= 1 && dist < nearestDist) {
                nearestDist = dist
                nearest = item
            }
        }

        if (!nearest) {
            this.setNearbyItem(null)
            return
        }

        this.setNearbyItem(nearest)
    },

    setNearbyItem(item: GroundItem | null) {
        if (this.nearbyItem === item) {
            return
        }

        if (this.nearbyItem) {
            this.nearbyItem.bounce = false
        }

        this.nearbyItem = item
        if (this.nearbyItem) {
            this.nearbyItem.bounce = true
        }
    },
}

class GroundItem {
    static readonly BOUNCE_HEIGHT = 0.175
    static readonly BOUNCE_SPEED = 0.008
    static readonly RETURN_TO_GROUND_SPEED = 0.8

    item: Item
    pos: Vector3
    matVector: Vector2
    rotationY: number = 0
    bounce: boolean = false
    yOffset: number = 0
    private wasBouncing: boolean = false
    private bounceStartTime: number = 0

    constructor(item: Item, pos: Vector3) {
        this.item = item
        this.pos = pos

        const type = GroundItemsManager.itemTypes.get(item.modelId)
        const matIndex = Math.max((item.materialId || 1) - 1, 0)
        this.matVector = this.getAtlasUvcOffsets(type?.cbData.matCols || 1, type?.cbData.matRows || 1, matIndex)
        this.rotationY = Math.random() * Math.PI * 2
    }

    getAtlasUvcOffsets(matCols: number, matRows: number, matIndex: number, pad = 0) {
        const tileX = matIndex % matCols
        const tileY = Math.floor(matIndex / matCols)

        const matCol = tileX + pad
        const matRow = matRows - (tileY + (1 - pad))
        return new Vector2(matCol, matRow)
    }

    onFrame(timeRate: number, time: number) {
        if (this.bounce) {
            if (!this.wasBouncing) {
                this.wasBouncing = true
                this.bounceStartTime = time
                this.yOffset = 0
            }

            const elapsed = time - this.bounceStartTime
            this.yOffset = ((Math.sin((elapsed * GroundItem.BOUNCE_SPEED) - (Math.PI / 2)) + 1) * 0.5) * GroundItem.BOUNCE_HEIGHT
            return
        }

        this.wasBouncing = false

        if (this.yOffset <= 0) {
            this.yOffset = 0
            return
        }

        this.yOffset = Math.max(0, this.yOffset - (GroundItem.RETURN_TO_GROUND_SPEED * timeRate))
    }
}

class GroundItemType {
    id: number
    mesh: Mesh | null = null
    count: number = -1

    instanceBuffer: Float32Array = new Float32Array(0)
    uvBuffer: Float32Array = new Float32Array(0)
    cbData: EquipCbItem
    thinReady: boolean = false

    constructor(id: number, cbData: EquipCbItem, mesh: Mesh) {
        this.id = id
        this.cbData = cbData
        this.mesh = mesh
    }

    ensureThinBuffers(type: GroundItemType) {
        if (!type.mesh) return
        if (type.thinReady) return

        type.mesh.thinInstanceSetBuffer('matrix', type.instanceBuffer, 16, false)
        type.mesh.thinInstanceRegisterAttribute('uvc', 2)
        type.mesh.thinInstanceSetBuffer('uvc', type.uvBuffer, 2, false)
        type.thinReady = true
    }

    updateCount(count: number) {
        if (count === this.count) {
            return
        }

        this.count = count
        this.instanceBuffer = new Float32Array(16 * count)
        this.uvBuffer = new Float32Array(2 * count)

        if (!this.mesh) return
        if (count === 0) {
            this.mesh.setEnabled(false)
            this.mesh.thinInstanceCount = 0
            return
        }

        this.mesh.setEnabled(true)
        this.mesh.alwaysSelectAsActiveMesh = true
        this.thinReady = false
        this.ensureThinBuffers(this)
    }
}

class GroundItemFxParticle {
    sprite: Sprite
    active: boolean = false
    ownerItemId: number = -1
    position: Vector3 = Vector3.Zero()
    life: number = 0
    maxLife: number = 0

    constructor(sprite: Sprite) {
        this.sprite = sprite
    }

    deactivate() {
        this.active = false
        this.ownerItemId = -1
        this.life = 0
        this.maxLife = 0
        this.sprite.isVisible = false
    }
}
