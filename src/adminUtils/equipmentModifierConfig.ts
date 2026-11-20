import { Matrix, Vector3 } from '@babylonjs/core'
import type { EquipBearer, EquipItem, EquipModelModifier } from '@/babylon/item/equipManager'
import type { CharacterPauldronModifiers } from '@/babylon/character/characterModelEquipModifiers'
import { getCharacterWeaponAttachmentMatrix } from '@/babylon/character/characterEquipmentFitting'

type Vector = { x: number, y: number, z: number }
type Transform = { position: Vector, rotation: Vector, scale: Vector }
interface Config {
    equipment: Record<string, Transform>
    pauldrons: Record<string, { left: Transform, right: Transform }>
    legs?: Record<string, { left: Transform, right: Transform }>
    weaponAttachment?: { correction: number[] }
    hair?: Record<string, Transform>
    hairPreviewColorId?: number
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
    item.modelModifierMatrix = getCharacterWeaponAttachmentMatrix(item.modelModifierMatrix ?? Matrix.Identity(), weaponCorrection)
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
    variant: 'male' | 'female' = 'male',
) {
    const url = variant === 'female' ? '/admin-utils/equipment-modifiers-female.json' : '/admin-utils/equipment-modifiers.json'
    const defaults = new Map(equipment)
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error('Could not load equipment modifiers')
    const config: Config = await response.json()
    const activate = () => {
        // The offline preview starts with neutral transforms, independently of game tuning.
        pauldronModifiers = pauldrons
        legModifiers.clear()
        equipment.clear()
        defaults.forEach((value, id) => equipment.set(id, value))
        equipment.forEach((_, id) => { if (id >= 1000) equipment.set(id, neutral()) })
        pauldrons.forEach((_, id) => pauldrons.set(id, { left: neutral(), right: neutral() }))
        weaponCorrection = config.weaponAttachment ? Matrix.FromArray(config.weaponAttachment.correction) : null
        Object.entries(config.equipment).forEach(([id, value]) => equipment.set(Number(id), deserialize(value)))
        Object.entries(config.pauldrons).forEach(([id, value]) => pauldrons.set(Number(id), {
            left: deserialize(value.left), right: deserialize(value.right),
        }))
        Object.entries(config.legs ?? {}).forEach(([id, value]) => legModifiers.set(Number(id), {
            left: deserialize(value.left), right: deserialize(value.right),
        }))
    }
    activate()
    return {
        activate,
        getHairColorId(): number {
            return config.hairPreviewColorId ?? 1
        },
        recordHairColorId(id: number) {
            config.hairPreviewColorId = id
        },
        getHair(typeId: number): EquipModelModifier {
            const value = config.hair?.[typeId]
            return value ? deserialize(value) : neutral()
        },
        recordHair(typeId: number, modifier: EquipModelModifier) {
            (config.hair ??= {})[typeId] = serialize(modifier)
        },
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
