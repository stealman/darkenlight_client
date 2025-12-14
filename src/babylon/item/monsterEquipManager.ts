import {
    Bone, Matrix,
    Mesh,
    Quaternion,
    Scene,
    SceneLoader, Vector2, Vector3,
} from '@babylonjs/core'
import { MonsterModel } from '@/babylon/monsters/monsterModel'
import { CustomMaterial } from '@babylonjs/materials'
import { CbWeaponsManager } from '@/babylon/item/codebook/cbWeapons'
import { CbArmorsManager } from '@/babylon/item/codebook/cbArmors'
import { CbEquipItemData } from '@/babylon/item/codebook/cbEquipItemData'

export const BASE_EQUIP_MATERIAL_PATH = "/assets/models/equip/"

export class EquipItem {
    parent: MonsterModel | null = null
    type: EquipItemType
    matVector: Vector2

    position: Vector3 = Vector3.Zero()
    quaternion: Quaternion = Quaternion.Identity()
    bone: Bone
    walkingBone: Bone
    activeBone: Bone
    scale: Vector3

    localPosition: Vector3 = Vector3.Zero()
    boneRotationQuaternion: Quaternion = Quaternion.Identity()
    localScale: Vector3 = Vector3.One()

    constructor(type: EquipItemType, matIndex: number, parent: MonsterModel, bone: Bone, walkingBone: Bone, scale: Vector3 = Vector3.One()) {
        this.type = type
        this.parent = parent
        this.bone = bone
        this.walkingBone = walkingBone
        this.activeBone = this.bone
        this.scale = scale

        const matRow = (type.cbData.matsY * 2) - ((Math.floor(matIndex / type.cbData.matsX) * 2) + 1.5)
        const matCol = ((matIndex % type.cbData.matsX) * 2) + 0.5
        this.matVector = new Vector2(matCol, matRow)
    }

    onFrame() {
        this.activeBone.computeWorldMatrix(true);
        this.activeBone.getWorldMatrix().decompose(this.localScale, this.boneRotationQuaternion, this.localPosition);

        this.quaternion = this.parent!.rotationQuaternion.multiply(this.boneRotationQuaternion);
        this.position = Vector3.TransformCoordinates(this.localPosition, this.parent!.worldMatrix);
    }

    setWalking(isWalking: boolean) {
        this.activeBone = isWalking ? this.walkingBone : this.bone
    }
}

export class EquipItemType {
    id: number
    name: string = ""
    mesh: Mesh | null = null
    count: number = 0

    instanceBuffer: Float32Array = new Float32Array(0)
    uvBuffer: Float32Array = new Float32Array(0)
    cbData: CbEquipItemData

    constructor(data: CbEquipItemData) {
        this.id = data.id
        this.cbData = data
    }

    async initializeMesh(scene: Scene, fileName: string, material: CustomMaterial, position: Vector3 = Vector3.Zero(), rotation: Vector3 = Vector3.Zero(), scale: Vector3 = Vector3.One()) {
        const result = await SceneLoader.ImportMeshAsync("", "/assets/models/equip/", fileName + ".babylon", scene);
        const source = result.meshes[0] as Mesh

        source.position = position
        source.rotation = rotation
        source.scaling = scale

        this.mesh = Mesh.MergeMeshes([source], true)!
        this.mesh.material = material
        this.mesh.setEnabled(false)
        this.mesh.alwaysSelectAsActiveMesh = true
    }

    updateCount(count: number) {
        this.count = count
        this.instanceBuffer = new Float32Array(16 * count)
        this.uvBuffer = new Float32Array(2 * count)

        if (this.mesh == null) {
            return
        }
        if (count === 0) {
            this.mesh.setEnabled(false)
        } else if (!this.mesh.isEnabled()) {
            this.mesh.alwaysSelectAsActiveMesh = true
            this.mesh.setEnabled(true)
        }
    }
}

export const MonsterEquipManager = {
    itemTypes: new Map<number, EquipItemType>(),
    equippedItems: new Map<EquipItemType, Set<EquipItem>>(),

    colorVec: new Vector2(0, 0),

    async initialize(scene: Scene) {
        await CbWeaponsManager.initMelee(this.itemTypes, scene)
        await CbArmorsManager.initHelmets(this.itemTypes, scene)
    },

    addEquippedItem(item: EquipItem) {
        if (!this.equippedItems.has(item.type)) {
            this.equippedItems.set(item.type, new Set())
        }
        this.equippedItems.get(item.type)!.add(item)
        item.type.updateCount(this.equippedItems.get(item.type)!.size)
    },

    removeEquippedItem(item: EquipItem) {
        this.equippedItems.get(item.type)?.delete(item)
        item.type.updateCount(this.equippedItems.get(item.type)!.size)
    },

    onFrame() {
        // For each item type, if at least one item is equipped, update the instance buffer
        this.equippedItems.forEach((items, type) => {
            if (type.count > 0) {
                let i = 0;

                // Every item has its position and rotation set in its onFrame() method
                items.forEach((item) => {
                    const posMatrix = Matrix.Translation(item.position.x, item.position.y, item.position.z);
                    const scaleMatrix = Matrix.Scaling(item.scale.x, item.scale.y, item.scale.z);
                    scaleMatrix.multiply(Matrix.FromQuaternionToRef(item.quaternion, new Matrix()).multiply(posMatrix)).copyToArray(type.instanceBuffer, i * 16);

                    type.uvBuffer[i * 2] = item.matVector.x
                    type.uvBuffer[i * 2 + 1] = item.matVector.y
                    i++;
                })
                type.mesh!.thinInstanceSetBuffer("matrix", type.instanceBuffer);
                type.mesh!.thinInstanceSetBuffer("uvc", type.uvBuffer, 2)
            }
        })
    }
}


