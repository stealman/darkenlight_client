import {
    Mesh,
    Quaternion,
    Scene,
    SceneLoader,
    SolidParticle,
    SolidParticleSystem, TransformNode, Vector2,
    Vector3, Vector4,
} from '@babylonjs/core'
import { Materials } from '@/babylon/materials'
import { Renderer } from '@/babylon/scene/renderer'

export const BASE_EQUIP_MATERIAL_PATH = "/assets/models/equip/"

class WearableItemManager {
    namePrefix: string
    sps: SolidParticleSystem
    spsMesh: Mesh | null = null
    models: WearableItemModel[] = []
    texturePath: string
    scene: Scene
    castShadows: boolean = false

    constructor(namePrefix: string, scene: Scene, models: WearableItemModel[], texturePath: string, castShadows: boolean = false) {
        this.namePrefix = namePrefix
        this.sps = new SolidParticleSystem(this.namePrefix + "Sps", scene, { expandable: true })
        this.models = models
        this.texturePath = texturePath
        this.scene = scene
        this.castShadows = castShadows
    }

    async initialize(scene: Scene) {
        for (const model of this.models) {
            const result = await SceneLoader.ImportMeshAsync("", "/assets/models/equip/", model.fileName, scene);
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
        this.spsMesh.material = Materials.getBasicMaterial(scene, this.namePrefix + "Mat", this.texturePath , false, true)
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

    addModelMeshToSps(model: WearableItemModel) {
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

class WearableItemModel {
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

const PlateArmorMaterials = [
    new Vector4(0.01, 0.76, 0.24, 0.99), // Iron
    new Vector4(0.76, 0.51, 0.99, 0.74), // Mythril
    new Vector4(0.01, 0.51, 0.24, 0.74), // Redstone
]

const SwordMaterials = {
    longsword_iron : new Vector4(0, 5/6, 0.5, 1),
    longsword_mythril : new Vector4(0.5, 5/6, 1, 1),
}

export const CharEquipManager = {
    helmetManager: null as WearableItemManager | null,
    armorManager: null as WearableItemManager | null,
    pauldronManager: null as WearableItemManager | null,
    legManager: null as WearableItemManager | null,
    swordManager: null as WearableItemManager | null,

    colorVec: new Vector2(0, 0),

    async initialize(scene: Scene) {
        const helmModels = [
            new WearableItemModel("male-plate-helm1", 1, "armors/helmet.babylon", new Vector3(0.46, 0.46, 0.46), new Vector3(0, 0.42, 0)),
            new WearableItemModel("male-plate-helm2", 2, "armors/helmet_closed.babylon", new Vector3(0.46, 0.46, 0.46), new Vector3(0, 0.42, 0)),
            ]

        this.helmetManager = new WearableItemManager("helm", scene, helmModels, "/assets/models/equip/armors/plate.png")
        await this.helmetManager.initialize(scene)

        const armorModels = [
            new WearableItemModel("male-plate-armor", 1, "armors/armor-plate.babylon", new Vector3(0.42, 0.42, 0.42), new Vector3(-0.01, 0.65, 0.03))]

        this.armorManager = new WearableItemManager("armor", scene, armorModels, "/assets/models/equip/armors/plate.png")
        await this.armorManager.initialize(scene)

        const pauldronModels = [
            new WearableItemModel("male-plate-pauldron-left", 1, "armors/pauldron-plate.babylon", new Vector3(0.48, 0.48, 0.52), new Vector3(0, -0.12, 0.065), new Vector3(0, -Math.PI / 2, 0)),
            new WearableItemModel("male-plate-pauldron-right", 2, "armors/pauldron-plate.babylon", new Vector3(0.48, 0.48, 0.52), new Vector3(0, -0.12, -0.05), new Vector3(0, Math.PI / 2, 0))
        ]

        this.pauldronManager = new WearableItemManager("pauldron", scene, pauldronModels, "/assets/models/equip/armors/plate.png")
        await this.pauldronManager.initialize(scene)

        const legModels = [
            new WearableItemModel("plate-legs", 1, "armors/leg-plate.babylon", new Vector3(0.26, 0.26, 0.23), new Vector3(-0.01, -0.1, 0.01))
        ]
        this.legManager = new WearableItemManager("legs", scene, legModels, "/assets/models/equip/armors/plate.png")
        await this.legManager.initialize(scene)

        const swordModels = [
            new WearableItemModel("sword", 1, "weapons/sword1.babylon", new Vector3(5, 5, 5), new Vector3(0.01, 0.1, 0), new Vector3(0, Math.PI / 2, Math.PI / 2))
        ]
        this.swordManager = new WearableItemManager("sword", scene, swordModels, "/assets/models/equip/weapons/swords.png", true)
        await this.swordManager.initialize(scene)
    },

    assignHelmet(node: TransformNode, modelId: number, materialId: number, scale: Vector3 = new Vector3(1, 1, 1)) {
        this.helmetManager!.assignItem(node, modelId, PlateArmorMaterials[materialId], scale)
    },

    assignArmor(node: TransformNode, modelId: number, materialId: number, scale: Vector3 = new Vector3(1, 1, 1)) {
        this.armorManager!.assignItem(node, modelId, PlateArmorMaterials[materialId], scale)
    },

    assignPauldron(node: TransformNode, modelId: number, materialId: number, scale: Vector3 = new Vector3(1, 1, 1)) {
        this.pauldronManager!.assignItem(node, modelId, PlateArmorMaterials[materialId], scale)
    },

    assignLeg(node: TransformNode, modelId: number, materialId: number, scale: Vector3 = new Vector3(1, 1, 1)) {
        this.legManager!.assignItem(node, modelId, PlateArmorMaterials[materialId], scale)
    },

    assignSword(node: TransformNode, modelId: number, materialId: number, scale: Vector3 = new Vector3(1, 1, 1)) {
        this.swordManager!.assignItem(node, modelId, SwordMaterials.longsword_mythril, scale)
    },

    onFrame() {
        this.helmetManager!.onFrame()
        this.armorManager!.onFrame()
        this.pauldronManager!.onFrame()
        this.legManager!.onFrame()
        this.swordManager!.onFrame()
    }
}


