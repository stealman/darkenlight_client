import { Matrix, Quaternion, Vector3 } from '@babylonjs/core'
import type { EquipItem } from '@/babylon/item/equipManager'
import type { MonsterModel } from '@/babylon/monsters/monsterModel'

type Component = 'scale' | 'position' | 'rotation'
const components: Component[] = ['scale', 'position', 'rotation']
const axes = ['x', 'y', 'z'] as const
interface ItemTransform { scale: Vector3; position: Vector3; rotation: Vector3 }

export function createMonsterEquipmentEditor(container: HTMLElement) {
    const section = document.createElement('section')
    section.hidden = true
    section.innerHTML = `<h2>Usazení výbavy</h2>
        <label class="admin-utils__field">Nasazený item<select data-item></select></label>
        <div class="admin-utils__modifier-row admin-utils__modifier-row--header"><span></span><span>X</span><span>Y</span><span>Z</span></div>
        ${components.map(component => `<div class="admin-utils__modifier-row"><span>${component === 'rotation' ? 'Rotace °' : component === 'position' ? 'Pozice' : 'Scale'}</span>${axes.map(axis => `<input type="number" step="0.01" ${component === 'scale' ? 'min="0.01"' : ''} data-component="${component}" data-axis="${axis}" aria-label="${component} ${axis}">`).join('')}</div>`).join('')}
        <button type="button" data-reset>Vrátit původní hodnoty</button>
        <label class="admin-utils__field">Hodnoty pro kód (rotace v radiánech)<textarea data-code readonly rows="6" spellcheck="false"></textarea></label>
        <button type="button" data-copy>Kopírovat hodnoty</button>
        <p data-message role="status"></p>`
    container.append(section)
    const select = section.querySelector<HTMLSelectElement>('[data-item]')!
    const code = section.querySelector<HTMLTextAreaElement>('[data-code]')!
    const message = section.querySelector<HTMLElement>('[data-message]')!
    const inputs = Array.from(section.querySelectorAll<HTMLInputElement>('input[data-component]'))
    const original = new WeakMap<EquipItem, ItemTransform>()
    const edited = new WeakMap<EquipItem, ItemTransform>()
    let items: EquipItem[] = []
    const snapshot = (item: EquipItem): ItemTransform => ({
        scale: item.scale.clone(),
        position: item.itemPosition?.clone() ?? Vector3.Zero(),
        rotation: item.itemRotation?.toEulerAngles() ?? Vector3.Zero(),
    })
    const clone = (value: ItemTransform): ItemTransform => ({scale: value.scale.clone(), position: value.position.clone(), rotation: value.rotation.clone()})
    const current = () => items[Number(select.value)]
    const format = (value: number) => String(Number(value.toFixed(2)))
    const writeCode = (value: ItemTransform) => {
        code.value = components.map(component => `${component}: new Vector3(${axes.map(axis => format(value[component][axis])).join(', ')}),`).join('\n')
    }
    const populate = () => {
        const item = current()
        if (!item) return
        const value = edited.get(item)!
        for (const input of inputs) {
            const component = input.dataset.component as Component
            const axis = input.dataset.axis as typeof axes[number]
            input.value = format(value[component][axis] * (component === 'rotation' ? 180 / Math.PI : 1))
        }
        writeCode(value)
        message.textContent = ''
    }
    const apply = (item: EquipItem, value: ItemTransform) => {
        // Runtime definitions can share these vectors. Only replace preview item values.
        item.scale = value.scale.clone()
        item.scaleMatrix = Matrix.Scaling(value.scale.x, value.scale.y, value.scale.z)
        item.itemPosition = value.position.clone()
        item.itemRotation = Quaternion.FromEulerVector(value.rotation)
        writeCode(value)
    }
    for (const input of inputs) input.addEventListener('input', () => {
        const item = current()
        if (!item || input.value === '' || input.validity.badInput || !Number.isFinite(input.valueAsNumber)) return
        const value = edited.get(item)!
        const component = input.dataset.component as Component
        const axis = input.dataset.axis as typeof axes[number]
        const rounded = Number(input.valueAsNumber.toFixed(2))
        if (component === 'scale' && rounded < 0.01) return
        value[component][axis] = rounded * (component === 'rotation' ? Math.PI / 180 : 1)
        apply(item, value)
    })
    for (const input of inputs) input.addEventListener('change', populate)
    select.addEventListener('change', populate)
    section.querySelector<HTMLButtonElement>('[data-reset]')!.onclick = () => {
        const item = current()
        if (!item) return
        const value = clone(original.get(item)!)
        edited.set(item, value)
        apply(item, value)
        populate()
    }
    section.querySelector<HTMLButtonElement>('[data-copy]')!.onclick = async () => {
        try {
            await navigator.clipboard.writeText(code.value)
            message.textContent = 'Zkopírováno.'
        } catch {
            code.focus(); code.select()
            message.textContent = 'Hodnoty jsou označené, zkopíruj je pomocí Ctrl+C.'
        }
    }
    return {
        refresh(model: MonsterModel | null) {
            const previous = current()
            items = model ? Array.from(model.equipSet) : []
            section.hidden = items.length === 0
            select.replaceChildren(...items.map((item, index) => {
                if (!original.has(item)) {
                    original.set(item, snapshot(item))
                    edited.set(item, clone(original.get(item)!))
                }
                const slot = item === model?.weaponEquipItem ? 'Zbraň' : item.bone === model?.chestBone ? 'Zbroj' : item.bone === model?.headBone ? 'Helma' : item.bone.name
                return new Option(`${slot} · ${item.type.cbData.model} (${item.type.id})`, String(index))
            }))
            if (previous && items.includes(previous)) select.value = String(items.indexOf(previous))
            populate()
        },
    }
}
