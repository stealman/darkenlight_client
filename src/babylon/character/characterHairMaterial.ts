import type { Scene } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { createCharacterMaterial } from '@/babylon/character/characterMaterial'

export function createCharacterHairMaterial(scene: Scene, name: string, albedoPath: string): PBRCustomMaterial {
    const material = new PBRCustomMaterial(name, scene)
    createCharacterMaterial(scene, name, albedoPath, material)
    material.AddAttribute('tint')
    material.Vertex_Definitions('attribute vec4 tint; varying vec4 vHairTint;')
    material.Vertex_MainEnd('vHairTint = tint;')
    material.Fragment_Definitions('varying vec4 vHairTint; float hairLightnessRatio = 1.0;')
    // Desaturate in linear space, retaining the texture's strand detail.
    material.Fragment_Custom_Albedo(`
        float hairBase = dot(surfaceAlbedo, vec3(0.2126, 0.7152, 0.0722));
        float hairAdjusted = pow(clamp(hairBase, 0.0, 1.0), exp2(-vHairTint.w));
        hairLightnessRatio = hairBase > 0.000001 ? hairAdjusted / hairBase : 1.0;
        result = vec3(hairAdjusted) * vHairTint.rgb;
    `)
    material.Fragment_Before_FinalColorComposition('finalEmissive = vec3(dot(finalEmissive, vec3(0.2126, 0.7152, 0.0722))) * vHairTint.rgb * hairLightnessRatio;')
    return material
}
