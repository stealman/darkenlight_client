import {
    Color3,
    Color4,
    Matrix,
    Mesh,
    MeshBuilder,
    PBRMaterial,
    Quaternion,
    Scene,
    Sprite,
    SpriteManager,
    Texture,
    Vector2,
    Vector3
} from '@babylonjs/core'
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
    flatItemTypes: new Map<string, GroundFlatItemType>(),
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
    ITEM_FLAT_SIZE: 0.65,
    ITEM_FLAT_ROTATION_X: Math.PI * 1 / 6,
    ITEM_FLAT_Y_LIFT: 0.1,

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
        this.flatItemTypes.forEach(type => type.dispose())
        this.itemTypes.clear()
        this.flatItemTypes.clear()
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

            const y = Utils.calculateWalkYPos(gitem.pos.x, gitem.pos.z, this.ITEM_BOX_SIZE) + this.ITEM_Y_OFFSET
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
        this.detectNearestItemProximity(time)
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
        const flatItemsByType = new Map<GroundFlatItemType, Array<GroundItem>>()

        for (const item of this.visibleItems) {
            if (!item.item.is3DModel()) {
                const flatType = this.getOrCreateFlatType(item)
                if (!flatType) {
                    continue
                }

                if (!flatItemsByType.has(flatType)) {
                    flatItemsByType.set(flatType, [])
                }
                flatItemsByType.get(flatType)!.push(item)
                continue
            }

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

        this.flatItemTypes.forEach((type) => {
            const typeItems = flatItemsByType.get(type) || []
            type.updateCount(typeItems.length)
            if (!type.mesh || typeItems.length === 0) {
                return
            }

            type.ensureThinBuffers(type)
            let i = 0
            for (const item of typeItems) {
                const itemY = item.pos.y + item.yOffset + this.ITEM_FLAT_Y_LIFT
                Matrix.TranslationToRef(item.pos.x, itemY, item.pos.z, this.tmpPos)
                Quaternion.FromEulerAnglesToRef(this.ITEM_FLAT_ROTATION_X, item.rotationY, 0, this.tmpQuat)
                Matrix.FromQuaternionToRef(this.tmpQuat, this.tmpRot)
                this.tmpRot.multiplyToRef(this.tmpPos, this.tmpWorld)
                this.tmpWorld.copyToArray(type.instanceBuffer, i * 16)
                i++
            }

            type.mesh.thinInstanceCount = i
            type.mesh.thinInstanceBufferUpdated('matrix')
            type.mesh.thinInstanceRefreshBoundingInfo()
        })
    },

    getOrCreateFlatType(item: GroundItem): GroundFlatItemType | null {
        if (!this.scene) {
            return null
        }
        const scene = this.scene

        const texturePath = item.item.imgUrl || ''
        const existingType = this.flatItemTypes.get(texturePath)
        if (existingType) {
            return existingType
        }

        const mesh = MeshBuilder.CreatePlane(`ground-item-flat-${this.flatItemTypes.size}`, {
            size: this.ITEM_FLAT_SIZE,
            sideOrientation: Mesh.DOUBLESIDE,
        }, scene)
        const material = this.createFlatItemMaterial(`ground-item-flat-mat-${this.flatItemTypes.size}`, texturePath)

        mesh.material = material
        mesh.isPickable = false
        mesh.receiveShadows = true
        mesh.alwaysSelectAsActiveMesh = true
        mesh.thinInstanceCount = 0
        mesh.setEnabled(false)

        const type = new GroundFlatItemType(texturePath, mesh, material)
        this.flatItemTypes.set(texturePath, type)
        return type
    },

    createFlatItemMaterial(name: string, texturePath: string): PBRMaterial {
        const scene = this.scene!
        const texture = new Texture(texturePath, scene)
        texture.hasAlpha = true
        texture.getAlphaFromRGB = false
        texture.updateSamplingMode(Texture.NEAREST_NEAREST)

        const material = new PBRMaterial(name, scene)
        material.albedoTexture = texture
        material.emissiveTexture = texture
        material.emissiveColor = new Color3(0.25, 0.25, 0.25)
        material.metallic = 0
        material.roughness = 1
        material.directIntensity = 1.5
        material.environmentIntensity = 1.5
        material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND
        material.useAlphaFromAlbedoTexture = true
        material.forceAlphaTest = false
        material.backFaceCulling = false
        material.twoSidedLighting = true
        material.usePhysicalLightFalloff = false
        return material
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

    getItemFxConfig(item: Item): GroundItemFxConfig {
        void item
        return {
            count: item.isEquippable() ? 4 : 2,
            color: this.yellow_fx,
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
        const visibleItemsById = new Map<number, GroundItem>()
        const fxConfigByItemId = new Map<number, GroundItemFxConfig>()
        for (const item of this.visibleItems) {
            this.tmpVisibleItemIds.add(item.item.id)
            visibleItemsById.set(item.item.id, item)
            fxConfigByItemId.set(item.item.id, this.getItemFxConfig(item.item))
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

            const fxConfig = fxConfigByItemId.get(particle.ownerItemId)
            if (!fxConfig) {
                particle.life = 0
                continue
            }

            particle.baseColor.set(fxConfig.color.r, fxConfig.color.g, fxConfig.color.b, fxConfig.color.a)
            activePerItem.set(particle.ownerItemId, (activePerItem.get(particle.ownerItemId) || 0) + 1)
        }

        let requestedParticles = 0
        for (const fxConfig of fxConfigByItemId.values()) {
            requestedParticles += Math.max(0, Math.floor(fxConfig.count))
        }
        const poolRatio = requestedParticles > 0 ? Math.min(1, this.FX_POOL_LIMIT / requestedParticles) : 0

        if (poolRatio > 0) {
            for (const [itemId, item] of visibleItemsById.entries()) {
                const fxConfig = fxConfigByItemId.get(itemId)
                if (!fxConfig) {
                    continue
                }

                const requestedCount = Math.max(0, Math.floor(fxConfig.count))
                let targetPerItem = Math.floor(requestedCount * poolRatio)
                if (requestedCount > 0 && targetPerItem === 0) {
                    targetPerItem = 1
                }

                let toSpawn = targetPerItem - (activePerItem.get(itemId) || 0)
                while (toSpawn > 0) {
                    if (!this.spawnFxParticle(item, fxConfig.color)) {
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

            particle.sprite.color.a = particle.baseColor.a * alphaFactor
        }
    },

    spawnFxParticle(item: GroundItem, color: Color4): boolean {
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
            particle.baseColor.set(color.r, color.g, color.b, color.a)

            particle.position.set(
                item.pos.x + xOffset,
                item.pos.y + yOffset,
                item.pos.z + zOffset
            )

            particle.sprite.position.copyFrom(particle.position)
            particle.sprite.isVisible = true
            particle.sprite.color.set(particle.baseColor.r, particle.baseColor.g, particle.baseColor.b, 0)
            particle.sprite.size = this.FX_PARTICLE_SIZE
            particle.sprite.angle = Math.random() * Math.PI * 2
            return true
        }
        return false
    },

    detectNearestItemProximity(time: number) {
        const myPos = MyPlayer.myChar?.pos
        if (!myPos || this.items.length === 0) {
            this.setNearbyItem(null, time)
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
            this.setNearbyItem(null, time)
            return
        }

        this.setNearbyItem(nearest, time)
    },

    setNearbyItem(item: GroundItem | null, time: number = Date.now()) {
        if (this.nearbyItem === item) {
            return
        }

        if (this.nearbyItem) {
            this.nearbyItem.bounce = false
            this.nearbyItem.nameDisplayTime = 0
        }

        this.nearbyItem = item
        if (this.nearbyItem) {
            this.nearbyItem.bounce = true
            this.nearbyItem.nameDisplayTime = time + 2000
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
    nameDisplayTime: number = 0
    private wasBouncing: boolean = false
    private bounceStartTime: number = 0

    constructor(item: Item, pos: Vector3) {
        this.item = item
        this.pos = pos

        const type = GroundItemsManager.itemTypes.get(item.modelId)
        const matIndex = Math.max((item.materialId || 1) - 1, 0)
        this.matVector = this.getAtlasUvcOffsets(type?.cbData.matCols || 1, type?.cbData.matRows || 1, matIndex)
        this.rotationY = item.is3DModel() ? Math.random() * Math.PI * 2 : Math.PI / 4
    }

    getAtlasUvcOffsets(matCols: number, matRows: number, matIndex: number, pad = 0) {
        const tileX = matIndex % matCols
        const tileY = Math.floor(matIndex / matCols)

        const matCol = tileX + pad
        const matRow = matRows - (tileY + (1 - pad))
        return new Vector2(matCol, matRow)
    }

    getNameTextNodeWorldPosition(): Vector3 {
        return new Vector3(this.pos.x, this.pos.y + 0.5 + this.yOffset, this.pos.z)
    }

    getNameTextNodeScreenPosition(): Vector3 | null {
        return ViewportManager.getPositionOnScreen(this.getNameTextNodeWorldPosition())
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

class GroundFlatItemType {
    id: string
    mesh: Mesh | null = null
    material: PBRMaterial | null = null
    count: number = -1
    instanceBuffer: Float32Array = new Float32Array(0)
    thinReady: boolean = false

    constructor(id: string, mesh: Mesh, material: PBRMaterial) {
        this.id = id
        this.mesh = mesh
        this.material = material
    }

    ensureThinBuffers(type: GroundFlatItemType) {
        if (!type.mesh) return
        if (type.thinReady) return
        type.mesh.thinInstanceSetBuffer('matrix', type.instanceBuffer, 16, false)
        type.thinReady = true
    }

    updateCount(count: number) {
        if (count === this.count) {
            return
        }

        this.count = count
        this.instanceBuffer = new Float32Array(16 * count)

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

    dispose() {
        this.material?.dispose()
        this.mesh?.dispose()
        this.material = null
        this.mesh = null
    }
}

class GroundItemFxParticle {
    sprite: Sprite
    active: boolean = false
    ownerItemId: number = -1
    position: Vector3 = Vector3.Zero()
    life: number = 0
    maxLife: number = 0
    baseColor: Color4 = new Color4(0.8, 0.6, 0.3, 1)

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

type GroundItemFxConfig = {
    count: number
    color: Color4
}
