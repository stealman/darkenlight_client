import { AssetContainer, Mesh, SceneLoader } from '@babylonjs/core'
import { Materials } from '@/babylon/materials'
import { MonsterType } from '@/babylon/monsters/codebook/monsterCodebook'
import { MonsterTemplate, MonsterTemplates } from '@/babylon/monsters/codebook/monsterTemplates'
import { Renderer } from '@/babylon/scene/renderer'

export const MonsterLoader = {
    monstersMeshes: [] as Mesh[],
    monsterTemplates: new Map<number, MonsterTemplate>(),
    modelContainers: new Map<string, AssetContainer>(),

    async initialize () {
        this.monstersMeshes = []
        this.monsterTemplates.clear()
        this.modelContainers.clear()
        for (const key in MonsterTemplates) {
            console.log("Loading monster mesh: " + key)
            await this.loadMonsterMesh(MonsterTemplates[key])
        }
    },

    async loadMonsterMesh (mobType: MonsterTemplate) {
        let assetContainer = this.modelContainers.get(mobType.meshName)
        if (!assetContainer) {
            assetContainer = await SceneLoader.LoadAssetContainerAsync(
                "",
                "/models/monsters/" + mobType.meshName, Renderer.scene
            )
            this.modelContainers.set(mobType.meshName, assetContainer)
        }

        const material = Materials.getPBRMaterial(Renderer.scene, mobType.getMaterialName(), "/models/monsters/" + mobType.textureName, true, false, {
            metallic: 0,
            roughness: 1,
            directIntensity: 1,
            environmentIntensity: 1,
        }, mobType.emissiveTextureName ? "/models/monsters/" + mobType.emissiveTextureName : null)

        // Monster meshes share the regular PBR material, while equipment uses
        // a two-sided lighting setup. Keep back-facing body polygons from
        // becoming unnaturally black under the close, downward indoor light.
        material.twoSidedLighting = true
        // Match the equipment materials' range-based attenuation. Babylon's
        // physical inverse-square falloff makes this short local light fade
        // too aggressively on otherwise nearby monster bodies.
        material.usePhysicalLightFalloff = false

        mobType.setAssetContainer(assetContainer)
        mobType.setMaterial(material)
        this.monsterTemplates.set(mobType.id, mobType)
    },

    getMonsterClone (mobType: MonsterType): MonsterTemplate {
        const template = this.monsterTemplates.get(mobType.templateId)!.clone()
        return template
    },
}


