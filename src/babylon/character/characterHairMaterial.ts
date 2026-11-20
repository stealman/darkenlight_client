import { PBRMaterial, type Scene } from '@babylonjs/core'
import { createCharacterMaterial } from '@/babylon/character/characterMaterial'

export function createCharacterHairMaterial(scene: Scene, name: string, albedoPath: string): PBRMaterial {
    // FPS comparison: render the original hair texture without tint shader hooks.
    return createCharacterMaterial(scene, name, albedoPath, new PBRMaterial(name, scene))
}
