import type { Scene } from '@babylonjs/core'
import { PBRCustomMaterial } from '@babylonjs/materials'
import { createCharacterMaterial } from '@/babylon/character/characterMaterial'

const atlasesByScene = new WeakMap<Scene, Map<string, PBRCustomMaterial>>()

export function getCharacterHairMaterial(scene: Scene, atlasPath: string): PBRCustomMaterial {
    let atlases = atlasesByScene.get(scene)
    if (!atlases) {
        atlases = new Map()
        atlasesByScene.set(scene, atlases)
    }
    const existing = atlases.get(atlasPath)
    if (existing) return existing

    const material = new PBRCustomMaterial(atlasPath, scene)
    createCharacterMaterial(scene, material.name, atlasPath, material)
    material.AddAttribute('uvc')
    material.Vertex_Definitions('attribute vec2 uvc;')
    // Select the same atlas tile for albedo and emissive in the vertex shader.
    material.Vertex_Before_PositionUpdated(`
        #ifdef UV1
        uvUpdated = uvUpdated * (239.0 / 1024.0) + vec2(8.5 / 1024.0) + uvc;
        #endif
    `)
    atlases.set(atlasPath, material)
    return material
}
