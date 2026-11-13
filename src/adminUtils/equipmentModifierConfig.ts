import { Matrix, Vector3 } from '@babylonjs/core'
import type { EquipBearer, EquipItem, EquipModelModifier } from '@/babylon/item/equipManager'
import type { CharacterPauldronModifiers } from '@/babylon/character/characterModelEquipModifiers'

type Vector = { x: number, y: number, z: number }
type Transform = { position: Vector, rotation: Vector, scale: Vector }
interface Config {
    equipment: Record<string, Transform>
    pauldrons: Record<string, { left: Transform, right: Transform }>
    legs?: Record<string, { left: Transform, right: Transform }>
    weaponAttachment?: { correction: number[] }
}

let weaponCorrection: Matrix | null = null
let pauldronModifiers = new Map<number, CharacterPauldronModifiers>()
const legModifiers = new Map<number, CharacterPauldronModifiers>()
const neutral = (): EquipModelModifier => ({ position: Vector3.Zero(), rotation: Vector3.Zero(), scale: Vector3.One() })

export function getPreviewPairedModifiers(slot: 'pauldrons' | 'legs', modelId: number) {
    const modifiers = slot === 'pauldrons' ? pauldronModifiers : legModifiers
    let pair = modifiers.get(modelId)
    if (!pair) {
        pair = { left: neutral(), right: neutral() }
        modifiers.set(modelId, pair)
    }
    return pair
}

export function bindPreviewWeapon(item: EquipItem, owner: Pick<EquipBearer, 'worldMatrix'>) {
    if (weaponCorrection) {
        item.modelModifierMatrix = (item.modelModifierMatrix ?? Matrix.Identity()).multiply(weaponCorrection)
    }
    bindPreviewEquipment(item, owner)
}

export function bindPreviewEquipment(item: EquipItem, owner: Pick<EquipBearer, 'worldMatrix'>, useJointNode = false) {
    const local = item.modelModifierMatrix?.clone() ?? Matrix.Identity()
    item.scale.setAll(1)
    item.scaleMatrix = Matrix.Identity()
    item.itemRotation = null
    item.itemPosition = Vector3.Zero()
    item.attachUsingFullBoneTransform(local, useJointNode)
}

const url = '/admin-utils/equipment-modifiers.json'
const serialize = (modifier: EquipModelModifier): Transform => {
    const vector = ({ x, y, z }: Vector): Vector => ({ x, y, z })
    return { position: vector(modifier.position), rotation: vector(modifier.rotation), scale: vector(modifier.scale) }
}
const deserialize = (modifier: Transform): EquipModelModifier => {
    const vector = ({ x, y, z }: Vector): Vector3 => new Vector3(x, y, z)
    return { position: vector(modifier.position), rotation: vector(modifier.rotation), scale: vector(modifier.scale) }
}

export async function loadEquipmentModifierConfig(
    equipment: Map<number, EquipModelModifier>,
    pauldrons: Map<number, CharacterPauldronModifiers>,
) {
    // The offline preview starts with neutral transforms, independently of game tuning.
    pauldronModifiers = pauldrons
    legModifiers.clear()
    equipment.forEach((_, id) => { if (id >= 1000) equipment.set(id, neutral()) })
    pauldrons.forEach((_, id) => pauldrons.set(id, { left: neutral(), right: neutral() }))
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error('Could not load equipment modifiers')
    const config: Config = await response.json()
    weaponCorrection = config.weaponAttachment ? Matrix.FromArray(config.weaponAttachment.correction) : null
    Object.entries(config.equipment).forEach(([id, value]) => equipment.set(Number(id), deserialize(value)))
    Object.entries(config.pauldrons).forEach(([id, value]) => pauldrons.set(Number(id), {
        left: deserialize(value.left), right: deserialize(value.right),
    }))
    Object.entries(config.legs ?? {}).forEach(([id, value]) => legModifiers.set(Number(id), {
        left: deserialize(value.left), right: deserialize(value.right),
    }))
    return {
        record(modelId: number, slot?: 'pauldrons' | 'legs') {
            if (slot) {
                const value = getPreviewPairedModifiers(slot, modelId)
                const target = slot === 'pauldrons' ? config.pauldrons : (config.legs ??= {})
                target[modelId] = { left: serialize(value.left), right: serialize(value.right) }
            } else {
                config.equipment[modelId] = serialize(equipment.get(modelId)!)
            }
        },
        async save() {
            const response = await fetch(url, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config),
            })
            if (!response.ok) throw new Error(`Save failed (${response.status})`)
        },
    }
}
