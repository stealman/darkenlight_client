import { PBRCustomMaterial } from '@babylonjs/materials'
import { Scene } from '@babylonjs/core'
import { VertexColorWeaponPalette, VertexRgb } from './types'

const SOURCE_COLOR_TOLERANCE = 0.003

function rgbToShader(color: VertexRgb): string {
    return `vec3(${color[0] / 255}, ${color[1] / 255}, ${color[2] / 255})`
}

function validatePalette(name: string, palette: VertexColorWeaponPalette) {
    if (palette.materialColors.length === 0) {
        throw new Error(`${name}: palette must contain at least one material colour row.`)
    }
    if (palette.materialNames.length !== palette.materialColors.length) {
        throw new Error(`${name}: material names must match the number of material colour rows.`)
    }

    const expectedSlotCount = palette.slots.length
    palette.slots.forEach((slot, index) => {
        if (slot.index !== index) {
            throw new Error(`${name}: palette slots must use contiguous indexes starting at 0.`)
        }
    })
    palette.materialColors.forEach((colors, index) => {
        if (colors.length !== expectedSlotCount) {
            throw new Error(`${name}: material row ${index + 1} has ${colors.length} colours; expected ${expectedSlotCount}.`)
        }
    })
}

function createSourceIndexCode(palette: VertexColorWeaponPalette): string {
    return palette.slots.map(slot => `
        if (all(lessThan(abs(sourceColor - ${rgbToShader(slot.source)}), vec3(${SOURCE_COLOR_TOLERANCE})))) {
            sourcePaletteIndex = ${slot.index};
        }`).join('\n')
}

function createMaterialColorCode(palette: VertexColorWeaponPalette): string {
    return palette.materialColors.map((colors, materialIndex) => colors.map((color, paletteIndex) => `
        if (materialIndex == ${materialIndex} && sourcePaletteIndex == ${paletteIndex}) {
            weaponPaletteColor = ${rgbToShader(color)};
        }`).join('\n')).join('\n')
}

/**
 * Creates a texture-free PBR material for one vertex-colour weapon model.
 * `uvc.x` is the existing thin-instance material index: materialId - 1.
 */
export function createVertexColorWeaponMaterial(name: string, scene: Scene, palette: VertexColorWeaponPalette): PBRCustomMaterial {
    validatePalette(name, palette)

    const mat = new PBRCustomMaterial(name, scene)
    mat.useVertexColors = true
    mat.AddAttribute('uvc')
    mat.Vertex_Definitions(`
        attribute vec2 uvc;
        varying vec3 weaponPaletteColor;
    `)
    mat.Vertex_MainEnd(`
        vec3 sourceColor = color.rgb;
        int sourcePaletteIndex = -1;
        int materialIndex = int(floor(uvc.x + 0.5));
        weaponPaletteColor = sourceColor;
        ${createSourceIndexCode(palette)}
        ${createMaterialColorCode(palette)}
        vColor.rgb = vec3(1.0);
    `)
    mat.Fragment_Definitions('varying vec3 weaponPaletteColor;')
    mat.Fragment_Custom_Albedo('result = weaponPaletteColor;')
    mat.metallic = 0.25
    mat.roughness = 1
    mat.directIntensity = 1.5
    mat.environmentIntensity = 1
    mat.usePhysicalLightFalloff = false
    mat.freeze()
    return mat
}
