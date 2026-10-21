import { Vector3 } from '@babylonjs/core'

// Kept independent from the item codebook to avoid circular initialization
// between world ground-item rendering and character equipment modules.
const armorEquipScales = new Map<number, Vector3>([
    [1000, new Vector3(1.57, 1.45, 1.6)],
    [1100, new Vector3(2, 1.9, 2)],
    [1200, new Vector3(2.45, 1.3, 1.8)],
    [1300, new Vector3(1.9, 1.3, 2)],
    [1400, new Vector3(1.2, 1.2, 1)],
    [2000, new Vector3(1.35, 1.45, 1.6)],
    [2100, new Vector3(2, 1.9, 2.05)],
    [2200, new Vector3(2.2, 1.3, 1.8)],
    [2300, new Vector3(1.65, 1.3, 2.25)],
])

export function getArmorEquipScale(modelId: number): Vector3 | null {
    return armorEquipScales.get(modelId) ?? null
}
