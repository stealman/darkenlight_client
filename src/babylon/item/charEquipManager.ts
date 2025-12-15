import {
    Mesh, PBRMaterial,
    Quaternion,
    Scene,
    SceneLoader,
    SolidParticle,
    SolidParticleSystem, TransformNode,
    Vector3, Vector4,
} from '@babylonjs/core'
import { Materials } from '@/babylon/materials'
import { Renderer } from '@/babylon/scene/renderer'
import { CharArmorsCbManager } from '@/babylon/item/codebook/charArmorsCb'

export const BASE_EQUIP_MATERIAL_PATH = "/public/models/equip/"

class CharWearableItemManager {
    namePrefix: string
    sps: SolidParticleSystem
    spsMesh: Mesh | null = null
    models: CharWearableItemModel[] = []
    texturePath: string
    scene: Scene
    castShadows: boolean = false

    constructor(namePrefix: string, scene: Scene, models: CharWearableItemModel[], texturePath: string, castShadows: boolean = false) {
        this.namePrefix = namePrefix
        this.sps = new SolidParticleSystem(this.namePrefix + "Sps", scene, { expandable: true })
        this.models = models
        this.texturePath = texturePath
        this.scene = scene
        this.castShadows = castShadows
    }

    async initialize(scene: Scene) {
        for (const model of this.models) {
            const result = await SceneLoader.ImportMeshAsync("", "/public/models/equip/", model.fileName, scene);
            model.setMesh(result.meshes[0] as Mesh)
        }
        this.registerLoadedMeshes(scene)
    }

    //Create SPS particles from loaded meshes
    registerLoadedMeshes(scene: Scene) {
        for (const model of this.models) {
            this.addModelMeshToSps(model)

            for (const p of this.sps.particles) {
                if (p.isVisible) {
                    p['obj'] = null
                    p['itemModelId'] = model.itemModelId
                    p.isVisible = false
                }
            }
        }

        // Build mesh object
        this.spsMesh = this.sps.buildMesh()
        this.spsMesh.receiveShadows = true
        this.spsMesh.material = Materials.getPBRMaterial(scene, this.namePrefix + "Mat", this.texturePath , false, true, 1, 0.75, 2, 1)
        if (this.castShadows) {
            Renderer.addShadowCaster(this.spsMesh)
        }

        // Override function that will update particle position on setParticles() call
        this.sps.updateParticle = (particle: SolidParticle) => {
            this.syncParticlePosition(particle)
            return particle
        }

        this.sps.setParticles()
    }

    syncParticlePosition(p: SolidParticle): void {
        if (p.obj != null) {
            const rotq = new Quaternion();
            p.obj.getWorldMatrix().decompose(null, rotq, null);
            p.rotationQuaternion = rotq;
            p.position.copyFrom(p.obj.getAbsolutePosition())
        } else if (p.isVisible) {
            p.isVisible = false;
        }
    }

    assignItem(node: TransformNode, itemModelId: number, uvs: Vector4, scale: Vector3) {
        let itemFound = false;

        for (const element of this.sps.particles) {
            const p = element
            if (p.itemModelId == itemModelId && p.obj == null) {
                p.obj = node
                p.isVisible = true
                p.uvs = uvs

                p.scaling.copyFrom(scale)
                itemFound = true
                break
            }
        }

        // If not found, create new particle
        if (!itemFound) {
            for (const element of this.models) {
                const model = element
                if (model.itemModelId === itemModelId) {
                    this.addModelMeshToSps(model)

                    this.sps.particles.forEach((p) => {
                        if (p.itemModelId === undefined) {
                            p['obj'] = null
                            p['itemModelId'] = itemModelId
                            p.isVisible = false
                        }
                    })
                    break
                }
            }
            this.spsMesh = this.sps.buildMesh()
            this.assignItem(node, itemModelId, uvs, scale)
        }

        this.sps.setParticles();
    }

    addModelMeshToSps(model: CharWearableItemModel) {
        model.mesh.rotation = model.baseRotation
        model.mesh.position = model.basePosition

        const merged = Mesh.MergeMeshes([model.mesh], false)
        this.sps.addShape(merged!, 1)
        merged!.dispose()
    }

    onFrame() {
        this.sps.setParticles();
    }
}

export class CharWearableItemModel {
    name: string
    itemModelId: number
    mesh: Mesh
    fileName: string
    baseScale: Vector3
    basePosition: Vector3
    baseRotation: Vector3

    constructor(name: string, itemModelId: number, fileName: string, baseScale: Vector3, basePosition: Vector3 = new Vector3(0, 0, 0), baseRotation: Vector3 = new Vector3(0, 0, 0)) {
        this.name = name
        this.itemModelId = itemModelId
        this.fileName = fileName
        this.baseScale = baseScale
        this.basePosition = basePosition
        this.baseRotation = baseRotation
    }

    setMesh(mesh: Mesh) {
        this.mesh = mesh
        this.mesh.scaling = this.baseScale
        this.mesh.setEnabled(false)
    }
}

const BasicPlateMetalMaterials = [
    new Vector4(0.01, 0.76, 0.24, 0.99), // Iron
    new Vector4(0.26, 0.76, 0.49, 0.99), // Astracyte
    new Vector4(0.51, 0.76, 0.74, 0.99), // Agapyte
    new Vector4(0.76, 0.76, 0.99, 0.99), // Gold
    new Vector4(0.01, 0.51, 0.24, 0.74), // Redstone
    new Vector4(0.26, 0.51, 0.49, 0.74), // Darkstone
    new Vector4(0.51, 0.51, 0.74, 0.74), // Amethyst
    new Vector4(0.76, 0.51, 0.99, 0.74), // Mythril
    new Vector4(0.01, 0.26, 0.24, 0.49), // Rust iron
    new Vector4(0.26, 0.26, 0.49, 0.49), // Shadow iron
]

export const CharEquipManager = {
    armorBasicMetalManager: null as CharWearableItemManager | null,

    swordDiamondMesh: null as Mesh | null,

    async initialize(scene: Scene) {
        CharArmorsCbManager.initialize()
        this.armorBasicMetalManager = new CharWearableItemManager("metal_armor_basic", scene, CharArmorsCbManager.basicMetalArmorModels, "/public/models/equip/armors/plate-metal-basic.png")
        await this.armorBasicMetalManager.initialize(scene)

        const result = await SceneLoader.ImportMeshAsync("", "/public/models/equip/weapons/", "sword_steel.glb", scene);
        this.swordDiamondMesh = result.meshes[0].getChildMeshes()[0] as Mesh
        this.swordDiamondMesh.setEnabled(false)
        this.swordDiamondMesh.scaling = new Vector3(2, 1, 1)
        this.swordDiamondMesh.rotation = new Vector3(Math.PI / 2, Math.PI / 2, 0)
        this.swordDiamondMesh.receiveShadows = true
        this.swordDiamondMesh.name = "swordDiamondMesh"

        const mat = this.swordDiamondMesh.material as PBRMaterial
        mat.metallic = 1
        mat.roughness = 0.75
        mat.backFaceCulling = false;
        mat.directIntensity = 2
        mat.environmentIntensity = 2

        Renderer.addShadowCaster(this.swordDiamondMesh)
    },

    assignHelmet(node: TransformNode, modelId: number, materialId: number, scale: Vector3 = new Vector3(1, 1, 1)) {
        this.armorBasicMetalManager!.assignItem(node, modelId, BasicPlateMetalMaterials[materialId], scale)
    },

    assignArmor(node: TransformNode, modelId: number, materialId: number, scale: Vector3 = new Vector3(1, 1, 1)) {
        this.armorBasicMetalManager!.assignItem(node, modelId, BasicPlateMetalMaterials[materialId], scale)
    },

    assignPauldron(node: TransformNode, modelId: number, materialId: number, scale: Vector3 = new Vector3(1, 1, 1)) {
        this.armorBasicMetalManager!.assignItem(node, modelId, BasicPlateMetalMaterials[materialId], scale)
    },

    assignLeg(node: TransformNode, modelId: number, materialId: number, scale: Vector3 = new Vector3(1, 1, 1)) {
        this.armorBasicMetalManager!.assignItem(node, modelId, BasicPlateMetalMaterials[materialId], scale)
    },

    assignSword(node: TransformNode, modelId: number, materialId: number, scale: Vector3 = new Vector3(1, 1, 1)) {
        //this.swordManager!.assignItem(node, modelId, BasicPlateMetalMaterials[4], scale)

        this.swordDiamondMesh!.parent = node
        this.swordDiamondMesh!.setEnabled(true)

    },

    onFrame() {
        this.armorBasicMetalManager!.onFrame()
    }
}
