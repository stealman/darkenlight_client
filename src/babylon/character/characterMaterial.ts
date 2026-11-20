import { Color3, PBRMaterial, Scene, Texture } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'

// Body and detachable heads use the same colour and lighting response.
export function createCharacterMaterial(scene: Scene, name: string, albedoPath?: string,
    material?: PBRMaterial): PBRMaterial {
    if (!material) {
        const skin = new PBRCustomMaterial(name, scene)
        // These atlases already contain painted form shading. Give the separate
        // body/head surfaces the same diffuse light response, while retaining
        // scene light intensity, attenuation and shadow reception.
        skin.Fragment_Before_Lights('normalW = vec3(0.0, 1.0, 0.0);')
        material = skin
    }
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
