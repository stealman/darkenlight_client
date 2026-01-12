import {
    Color3,
    Color4, GPUParticleSystem,
    Mesh, ParticleSystem, PBRMaterial,
    Quaternion,
    Scene,
    SceneLoader,
    SolidParticle,
    SolidParticleSystem, StandardMaterial, Texture, TrailMesh, TransformNode,
    Vector3, Vector4,
} from '@babylonjs/core'
import { Materials, PBRBasicAtts } from '@/babylon/materials'
import { Renderer } from '@/babylon/scene/renderer'
import { CharArmorsCbManager } from '@/babylon/item/codebook/charArmorsCb'
import { CharWeaponsCbManager } from '@/babylon/item/codebook/charWeaponsCb'
import { CharacterModel } from '@/babylon/character/characterModel'
import { BabylonUtils } from '@/babylon/utils'
import { Lights } from '@/babylon/scene/lights'

export const BASE_EQUIP_MATERIAL_PATH = "/models/equip/"
export const PLATE_METAL_BASIC = 'plate-metal-basic'

class CharWearableItemManager {
    materialName: string
    sps: SolidParticleSystem
    spsMesh: Mesh | null = null
    models: CharWearableItemModel[] = []
    texturePath: string
    matOptions: PBRBasicAtts
    scene: Scene
    castShadows: boolean = false
    particleSourceParent = new TransformNode("charEquipParticleSources", this.scene)

    constructor(materialName: string, scene: Scene, models: CharWearableItemModel[], texturePath: string, castShadows: boolean = false, matOptions: PBRBasicAtts) {
        this.materialName = materialName
        this.sps = new SolidParticleSystem(this.materialName + "Sps", scene, { expandable: true })
        this.models = models
        this.texturePath = texturePath
        this.castShadows = castShadows
        this.matOptions = matOptions
    }

    async initialize(scene: Scene) {
        for (const model of this.models) {
            const result = await SceneLoader.ImportMeshAsync("", BASE_EQUIP_MATERIAL_PATH, model.fileName, scene);
            model.setMesh(result.meshes[0] as Mesh)
            result.meshes[0].parent = this.particleSourceParent
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
        this.spsMesh.alwaysSelectAsActiveMesh = true
        this.spsMesh.receiveShadows = true
        this.spsMesh.material = Materials.getPBRMaterial(scene, this.materialName + "charEquipMap", this.texturePath , false, true, this.matOptions)
        if (this.castShadows) {
            Lights.addShadowCaster(this.spsMesh)
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
            p.obj.computeWorldMatrix(true);
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

export const CharEquipManager = {
    armorBasicMetalManager: null as CharWearableItemManager | null,
    weaponSourceMap: new Map<number, Mesh>() as Map<number, Mesh>,

    async initialize(scene: Scene) {
        this.weaponSourceMap = new Map<number, Mesh>()
        CharArmorsCbManager.initialize()
        CharWeaponsCbManager.initialize()

        this.armorBasicMetalManager = new CharWearableItemManager(PLATE_METAL_BASIC, scene, CharArmorsCbManager.basicMetalArmorModels, "/models/equip/armors/plate-metal-basic.png", false, {
            metallic: 1.0,
            roughness: 0.75,
            directIntensity: 1.5,
            environmentIntensity: 1,
        })
        await this.armorBasicMetalManager.initialize(scene)
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

    async assignWeapon(owner: CharacterModel, node: TransformNode, weaponTypelId: number) {
        if (!this.weaponSourceMap.has(weaponTypelId)) {
            await this.loadWeaponModel(weaponTypelId)
        }
        let weapon = this.weaponSourceMap.get(weaponTypelId)!
        if (weapon.parent) {
            console.log("Cloning weapon mesh")
            weapon = weapon.clone("weaponClone") as Mesh
        }
        weapon.parent = node
        weapon.setEnabled(true)
        weapon.trailMesh = this.createWeaponTrail(node)
        this.createSwordParticles(node)
        owner.weaponMesh = weapon
    },

    createWeaponTrail(boneNode: TransformNode): TrailMesh {
        const tip = new TransformNode('swordTip', Renderer.scene)
        tip.parent = boneNode
        tip.position = new Vector3(0, 3.5, 0)
        const trail = new TrailMesh('swordTrail', tip, Renderer.scene, 0.5, 60, true)

        const mat = new StandardMaterial('swordTrailMat', Renderer.scene)
        mat.disableLighting = true
        mat.emissiveColor = new Color3(1, 1, 1)
        mat.alpha = 0.25
        trail.material = mat

        trail.setEnabled(false)
        return trail
    },

    createSwordParticles(boneNode: TransformNode) {
        const emitter = new TransformNode('swordSmearEmitter', Renderer.scene)
        emitter.parent = boneNode
        emitter.position = new Vector3(0, 2.8, 0)

        const ps = new GPUParticleSystem("charWeaponParticles", {
            capacity: 500
        }, Renderer.scene);
        ps.particleTexture = new Texture('images/gfx/flare-rect.png', Renderer.scene)

        ps.createBoxEmitter(
            Vector3.Zero(),
            Vector3.Zero(),
            new Vector3(-0.02, -1, -0.15),
            new Vector3( 0.02,  1,  0.15)
        )

        ps.addSizeGradient(0, 0.075)
        ps.addSizeGradient(1, 0.04)

        ps.minLifeTime = 0.4
        ps.maxLifeTime = 0.6

        ps.emitRate = 300
        ps.blendMode = ParticleSystem.BLENDMODE_ONEONE

        ps.direction1 = BabylonUtils.getSymVector(-2)
        ps.direction2 = BabylonUtils.getSymVector(2)
        ps.minEmitPower = 0.2
        ps.maxEmitPower = 0.5
        ps.updateSpeed = 0.02

        // Gravity upwards
        ps.gravity = new Vector3(0, 2, 0)
        ps.addColorGradient(0, new Color4(0.8, 0.3, 0.1, 0.5))
        ps.addColorGradient(0.8, new Color4(0.1, 0.05, 0.01, 0.2))
        ps.addColorGradient(1, new Color4(0.1, 0.05, 0.01, 0.00))
        ps.emitter = emitter
        ps.start()
    },

    async loadWeaponModel(weaponTypelId: number): Mesh | null {
        const modelData: CharWearableItemModel = CharWeaponsCbManager.weaponModels.get(weaponTypelId)!
        if (!modelData) {
            console.warn(`Weapon model with ID ${weaponTypelId} not found.`)
            return null
        }

        const result = await SceneLoader.ImportMeshAsync("", "/models/equip/weapons/", modelData.fileName, Renderer.scene);
        const mesh = result.meshes[0].getChildMeshes()[0] as Mesh
        mesh.setEnabled(false)
        mesh.parent = null
        mesh.scaling = modelData.baseScale
        mesh.rotation = modelData.baseRotation
        mesh.receiveShadows = true

        const mat = mesh.material as PBRMaterial
        mat.metallic = 1
        mat.roughness = 0.75
        mat.directIntensity = 1.5
        mat.environmentIntensity = 1
        mat.backFaceCulling = false;
        Lights.addShadowCaster(mesh)
        this.weaponSourceMap.set(weaponTypelId, mesh)
    },

    onFrame() {
        this.armorBasicMetalManager!.onFrame()
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
