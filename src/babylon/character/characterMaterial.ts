import { Color3, PBRMaterial, Scene, Texture } from '@babylonjs/core'

// Body and detachable heads use the same colour and lighting response.
export function createCharacterMaterial(scene: Scene, name: string, albedoPath?: string,
    material: PBRMaterial = new PBRMaterial(name, scene)): PBRMaterial {
    if (albedoPath) {
        const texture = new Texture(albedoPath, scene, { invertY: false })
        texture.hasAlpha = false
        texture.gammaSpace = true
        material.albedoTexture = texture
    }
    material.metallic = 0
    material.roughness = 1
    material.directIntensity = 1
    material.environmentIntensity = 1
    material.emissiveTexture = material.albedoTexture
    material.emissiveColor = new Color3(0.15, 0.15, 0.15)
    material.backFaceCulling = false
    material.twoSidedLighting = true
    material.usePhysicalLightFalloff = false
    return material
}
