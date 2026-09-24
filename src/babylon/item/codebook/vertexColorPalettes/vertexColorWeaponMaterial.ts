import { PBRCustomMaterial } from '@babylonjs/materials'
import { Scene } from '@babylonjs/core'
import { VertexColorWeaponPalette, VertexRgb } from './types'

const SOURCE_COLOR_TOLERANCE = 0.003
const WEAPON_EMISSIVE_STRENGTH = 0.06
const PYROXIDE_MATERIAL_NAME = 'Pyroxide'
const PYROXIDE_METAL_EMISSIVE_STRENGTH = 0.28
const METAL_WEAPON_METALLIC = 0.65
const METAL_WEAPON_ROUGHNESS = 0.78

function rgbToShader(color: VertexRgb): string {
    return `vec3(${color[0] / 255}, ${color[1] / 255}, ${color[2] / 255})`
}

function rgbSrgbToLinearShader(color: VertexRgb): string {
    const srgbToLinear = (component: number) => {
        const normalized = component / 255
        return normalized <= 0.04045
            ? normalized / 12.92
            : Math.pow((normalized + 0.055) / 1.055, 2.4)
    }
    return `vec3(${srgbToLinear(color[0])}, ${srgbToLinear(color[1])}, ${srgbToLinear(color[2])})`
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
    palette.metallicMaterialIndexes?.forEach(materialIndex => {
        if (!Number.isInteger(materialIndex) || materialIndex < 0 || materialIndex >= palette.materialColors.length) {
            throw new Error(`${name}: metallic material indexes must reference a material colour row.`)
        }
    })
    palette.emissiveMetalMaterialIndexes?.forEach(materialIndex => {
        if (!Number.isInteger(materialIndex) || materialIndex < 0 || materialIndex >= palette.materialColors.length) {
            throw new Error(`${name}: emissive metal material indexes must reference a material colour row.`)
        }
    })
    if (palette.emissiveMetalStrength != null && (palette.emissiveMetalStrength < 0 || palette.emissiveMetalStrength > 1)) {
        throw new Error(`${name}: emissive metal strength must be between 0 and 1.`)
    }
    if (palette.baseEmissiveStrength != null && (palette.baseEmissiveStrength < 0 || palette.baseEmissiveStrength > 1)) {
        throw new Error(`${name}: base emissive strength must be between 0 and 1.`)
    }
}

function createSourceIndexCode(palette: VertexColorWeaponPalette): string {
    return palette.slots.map(slot => `
        if (all(lessThan(abs(sourceColor - ${rgbToShader(slot.source)}), vec3(${SOURCE_COLOR_TOLERANCE})))) {
            sourcePaletteIndex = ${slot.index};
        }`).join('\n')
}

function createMaterialColorCode(palette: VertexColorWeaponPalette): string {
    const toShaderColor = palette.materialColorSpace === 'srgb' ? rgbSrgbToLinearShader : rgbToShader
    return palette.materialColors.map((colors, materialIndex) => colors.map((color, paletteIndex) => `
        if (materialIndex == ${materialIndex} && sourcePaletteIndex == ${paletteIndex}) {
            weaponPaletteColor = ${toShaderColor(color)};
        }`).join('\n')).join('\n')
}

function createMaterialSurfaceCode(palette: VertexColorWeaponPalette): string {
    const metalSlots = palette.slots.filter(slot => slot.isMetal)
    if (metalSlots.length === 0) return ''

    const metalMaterialCondition = palette.metallicMaterialIndexes
        ? `(${palette.metallicMaterialIndexes.map(index => `materialIndex == ${index}`).join(' || ')})`
        : 'true'

    return metalSlots.map(slot => `
        if (${metalMaterialCondition} && sourcePaletteIndex == ${slot.index}) {
            weaponMetalMask = 1.0;
        }`).join('\n')
}

function createEmissiveMetalCode(palette: VertexColorWeaponPalette): string {
    const emissiveMaterialIndexes = palette.emissiveMetalMaterialIndexes ?? palette.materialNames
        .map((materialName, index) => materialName === PYROXIDE_MATERIAL_NAME ? index : -1)
        .filter(index => index >= 0)
    if (emissiveMaterialIndexes.length === 0) return ''

    const metalSlots = palette.slots.filter(slot => slot.isMetal)
    const materialCondition = `(${emissiveMaterialIndexes.map(index => `materialIndex == ${index}`).join(' || ')})`
    const strength = palette.emissiveMetalStrength ?? PYROXIDE_METAL_EMISSIVE_STRENGTH

    return metalSlots.map(slot => `
        if (${materialCondition} && sourcePaletteIndex == ${slot.index}) {
            weaponEmissiveStrength = ${strength};
        }`).join('\n')
}

type VertexColorMaterialOptions = {
    /** The supplied material already declares and supplies the thin-instance uvc attribute. */
    hasUvcAttribute?: boolean
}

/**
 * Applies a vertex-colour palette to an existing PBR custom material.
 * This lets armour preserve the exact atlas material setup while replacing
 * only its final albedo colour.
 */
export function applyVertexColorPaletteToMaterial(mat: PBRCustomMaterial, palette: VertexColorWeaponPalette, options: VertexColorMaterialOptions = {}) {
    validatePalette(mat.name, palette)
    const baseEmissiveStrength = palette.baseEmissiveStrength ?? WEAPON_EMISSIVE_STRENGTH
    const baseEmissiveStrengthShader = baseEmissiveStrength.toFixed(6)

    mat.useVertexColors = true
    if (!options.hasUvcAttribute) {
        mat.AddAttribute('uvc')
    }
    mat.Vertex_Definitions(`
        // PBRCustomMaterial replaces (rather than appends) this shader slot,
        // so declare uvc even when the armor material registered it earlier.
        attribute vec2 uvc;
        varying vec3 weaponPaletteColor;
        varying float weaponMetalMask;
        varying float weaponEmissiveStrength;
    `)
    mat.Vertex_MainEnd(`
        vec3 sourceColor = color.rgb;
        int sourcePaletteIndex = -1;
        int materialIndex = int(floor(uvc.x + 0.5));
        weaponPaletteColor = sourceColor;
        weaponMetalMask = 0.0;
        weaponEmissiveStrength = ${baseEmissiveStrengthShader};
        ${createSourceIndexCode(palette)}
        ${createMaterialColorCode(palette)}
        ${createMaterialSurfaceCode(palette)}
        ${createEmissiveMetalCode(palette)}
        vColor.rgb = vec3(1.0);
    `)
    mat.Fragment_Definitions(`
        varying vec3 weaponPaletteColor;
        varying float weaponMetalMask;
        varying float weaponEmissiveStrength;
    `)
    mat.Fragment_Custom_Albedo('result = weaponPaletteColor;')
    mat.Fragment_Custom_MetallicRoughness(`
        metallicRoughness.r *= weaponMetalMask;
        metallicRoughness.g = mix(1.0, metallicRoughness.g, weaponMetalMask);
    `)
    mat.Fragment_Before_FinalColorComposition('finalEmissive += weaponPaletteColor * weaponEmissiveStrength;')
    if (palette.twoSided) {
        mat.backFaceCulling = false
        mat.twoSidedLighting = false
    }
}

/**
 * Creates a texture-free PBR material for one vertex-colour weapon model.
 * `uvc.x` is the existing thin-instance material index: materialId - 1.
 */
export function createVertexColorWeaponMaterial(name: string, scene: Scene, palette: VertexColorWeaponPalette): PBRCustomMaterial {
    const mat = new PBRCustomMaterial(name, scene)
    applyVertexColorPaletteToMaterial(mat, palette)
    mat.metallic = METAL_WEAPON_METALLIC
    mat.roughness = METAL_WEAPON_ROUGHNESS
    mat.directIntensity = 1.5
    mat.environmentIntensity = 1
    mat.usePhysicalLightFalloff = false
    if (palette.twoSided) {
        mat.backFaceCulling = false
        mat.twoSidedLighting = false
    }
    return mat
}
