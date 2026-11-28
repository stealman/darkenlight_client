import { AssetContainer, Color3, Mesh, PBRMaterial, SceneLoader, Texture } from '@babylonjs/core'
import { Materials } from '@/babylon/materials'
import { MonsterType } from '@/babylon/monsters/codebook/monsterCodebook'
import { MonsterTemplate, MonsterTemplates } from '@/babylon/monsters/codebook/monsterTemplates'
import { Renderer } from '@/babylon/scene/renderer'
import { Lights } from '@/babylon/scene/lights'
import { modelAssetUrl } from '@/babylon/modelAssetUrl'
import { Settings } from '@/settings/settings'

export const MonsterLoader = {
    monstersMeshes: [] as Mesh[],
    monsterTemplates: new Map<number, MonsterTemplate>(),
    modelContainers: new Map<string, AssetContainer>(),
    shavedSheepMaterial: null as PBRMaterial | null,
    selectedShavedSheepMaterial: null as PBRMaterial | null,

    async initialize () {
        this.monstersMeshes = []
        this.monsterTemplates.clear()
        this.modelContainers.clear()
        this.shavedSheepMaterial = null
        this.selectedShavedSheepMaterial = null
        for (const key in MonsterTemplates) {
            console.log("Loading monster mesh: " + key)
            await this.loadMonsterMesh(MonsterTemplates[key])
        }
    },

    async getModelContainer(url: string) {
        let container = this.modelContainers.get(url)
        if (!container) {
            container = await SceneLoader.LoadAssetContainerAsync('', url, Renderer.scene)
            this.modelContainers.set(url, container)
        }
        return container
    },

    async prepareKoboldDistanceLod(template: MonsterTemplate, base: AssetContainer, path: string) {
        const lod = Settings.detailLevel.modelLod
        const isKobold2 = template.meshName === MonsterTemplates.KOBOLD_2.meshName
        const useLowerLod = lod !== 3 && (isKobold2 || (lod === 1 && template.meshName === MonsterTemplates.KOBOLD.meshName))
        if (!useLowerLod) return
        const variant = __MODEL_ASSET_URLS__[path.replace(/\.gltf$/, `_lod${lod + 1}.gltf`)]
        if (!variant) return
        try {
            const distant = await this.getModelContainer(variant)
            const bodyMeshes = (container: AssetContainer) => container.meshes.filter(
                (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.geometry !== null,
            )
            const nearMeshes = bodyMeshes(base), farMeshes = bodyMeshes(distant)
            if (nearMeshes.length !== 1 || farMeshes.length !== 1) return
            const near = nearMeshes[0], far = farMeshes[0]
            const nearBones = near.skeleton?.bones, farBones = far.skeleton?.bones
            if (!near.geometry || !far.geometry || near.subMeshes.length !== 1 || far.subMeshes.length !== 1
                || near.morphTargetManager || far.morphTargetManager || near.numBoneInfluencers !== far.numBoneInfluencers
                || far.getTotalIndices() >= near.getTotalIndices() || !nearBones || !farBones || nearBones.length !== farBones.length
                || nearBones.some((bone, i) => bone.name !== farBones[i].name || bone.getIndex() !== farBones[i].getIndex())) return
            template.distanceLod = {near: near.geometry, far: far.geometry}
        } catch (error) {
            console.warn(`Distance LOD unavailable for ${template.meshName}`, error)
        }
    },

    async loadMonsterMesh (mobType: MonsterTemplate) {
        const path = '/models/monsters/' + mobType.meshName
        const assetContainer = await this.getModelContainer(modelAssetUrl(path, Renderer.scene))

        const material = Materials.getPBRMaterial(Renderer.scene, mobType.getMaterialName(), "/models/monsters/" + mobType.textureName, true, false, {
            metallic: 0,
            roughness: 1,
            directIntensity: 1,
            environmentIntensity: mobType.environmentIntensity,
        }, mobType.emissiveTextureName ? "/models/monsters/" + mobType.emissiveTextureName : null)

        if (mobType.normalTextureName) {
            const normalTexture = new Texture(
                "/models/monsters/" + mobType.normalTextureName,
                Renderer.scene,
                { invertY: false },
            )
            normalTexture.gammaSpace = false
            material.bumpTexture = normalTexture
        }

        // Monster meshes share the regular PBR material, while equipment uses
        // a two-sided lighting setup. Keep back-facing body polygons from
        // becoming unnaturally black under the close, downward indoor light.
        material.twoSidedLighting = true
        // Kobold meshes have inconsistent triangle winding. Render both sides
        // for all their skins so back-face culling does not leave visible holes.
        if ([MonsterTemplates.KOBOLD.meshName, MonsterTemplates.KOBOLD_2.meshName].includes(mobType.meshName)) {
            material.backFaceCulling = false
        }
        // Match the equipment materials' range-based attenuation. Babylon's
        // physical inverse-square falloff makes this short local light fade
        // too aggressively on otherwise nearby monster bodies.
        material.usePhysicalLightFalloff = false

        const selectedMaterial = material.clone(`${mobType.getMaterialName()}_selected`) as PBRMaterial
        selectedMaterial.albedoTexture = material.albedoTexture
        if (mobType.emissiveTextureName) {
            // Preserve the authored emissive map and add the selection lift as
            // a separate lightmap. A cloned texture keeps its own intensity
            // without duplicating the underlying image data.
            const selectedLightmapTexture = material.albedoTexture?.clone()
            if (selectedLightmapTexture) {
                selectedLightmapTexture.level = mobType.selectedEmissiveStrength
                selectedMaterial.lightmapTexture = selectedLightmapTexture
                selectedMaterial.useLightmapAsShadowmap = false
            }
        } else {
            // Reuse the albedo as weak self-illumination so selection reveals
            // the monster's real colours instead of adding a tint.
            selectedMaterial.emissiveTexture = material.albedoTexture
            selectedMaterial.emissiveColor = new Color3(
                mobType.selectedEmissiveStrength,
                mobType.selectedEmissiveStrength,
                mobType.selectedEmissiveStrength,
            )
        }

        mobType.setAssetContainer(assetContainer)
        await this.prepareKoboldDistanceLod(mobType, assetContainer, path)
        mobType.setMaterials(material, selectedMaterial)
        if (mobType.id === 1201) {
            const texture = new Texture('/models/monsters/sheep_shaved.png', Renderer.scene, {invertY: false})
            texture.hasAlpha = true
            texture.gammaSpace = true
            this.shavedSheepMaterial = material.clone('sheep_shaved')
            this.shavedSheepMaterial.albedoTexture = texture
            this.selectedShavedSheepMaterial = selectedMaterial.clone('sheep_shaved_selected')
            this.selectedShavedSheepMaterial.albedoTexture = texture
            this.selectedShavedSheepMaterial.emissiveTexture = texture
        }
        this.monsterTemplates.set(mobType.id, mobType)
    },

    getMonsterClone (mobType: MonsterType): MonsterTemplate {
        const template = this.monsterTemplates.get(mobType.templateId)!.clone()
        return template
    },

    async prepareRuntimeClones(clonesPerTemplate = MonsterTemplate.PREWARM_CLONES) {
        for (const template of this.monsterTemplates.values()) {
            const clones: MonsterTemplate[] = []
            try {
                for (let index = 0; index < clonesPerTemplate; index++) {
                    clones.push(template.clone())
                }

                const warmupClone = clones[0]
                if (warmupClone != null && template.material != null) {
                    warmupClone.mesh.material = template.material
                    await Lights.compileActorLightVariants(warmupClone.mesh, template.material)
                }
                if (warmupClone != null && template.selectedMaterial != null) {
                    warmupClone.mesh.material = template.selectedMaterial
                    await Lights.compileActorLightVariants(warmupClone.mesh, template.selectedMaterial)
                    warmupClone.mesh.material = template.material ?? null
                }
                if (warmupClone != null && template.id === 1201) {
                    for (const material of [this.shavedSheepMaterial, this.selectedShavedSheepMaterial]) {
                        if (!material) continue
                        warmupClone.mesh.material = material
                        await Lights.compileActorLightVariants(warmupClone.mesh, material)
                    }
                    warmupClone.mesh.material = template.material ?? null
                }
            } catch (error) {
                console.warn(`Monster runtime warm-up failed for template ${template.id}`, error)
            } finally {
                clones.forEach(clone => {
                    clone.node.setEnabled(false)
                    clone.mesh.setEnabled(false)
                    template.freeClone(clone)
                })
            }
        }
    },
}


