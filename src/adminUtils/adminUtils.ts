import '@babylonjs/loaders/glTF'
import {
    ArcRotateCamera,
    Color3,
    Color4,
    DirectionalLight,
    DynamicTexture,
    Engine,
    HemisphericLight,
    MeshBuilder,
    PBRMaterial,
    Scene,
    StandardMaterial,
    Texture,
    Vector3,
} from '@babylonjs/core'
import type Character from '@/babylon/character/character'
import type { CharacterModel } from '@/babylon/character/characterModel'
import type { EquipModelModifier } from '@/babylon/item/equipManager'
import './styles.css'

type PreviewSlot = 'body' | 'head' | 'pauldrons' | 'legs' | 'shield' | 'weapon'
type PreviewAnimation = 'idle' | 'walk' | 'run' | 'combatIdle' | 'slash' | 'jab' | 'death'
type AdminUtilsSection = 'materialAtlas' | 'weaponMaterialAtlas' | 'equipment'
type ArmorMaterialFamily = 'plate' | 'chain'
type MaterialFamily = ArmorMaterialFamily | 'weapon'
type ModifierComponent = 'scale' | 'position' | 'rotation'
type ModifierAxis = 'x' | 'y' | 'z'
type PauldronSide = 'left' | 'right'
type AtlasMaterialParameter = 'brightness' | 'contrast' | 'hueR' | 'hueG' | 'hueB'

interface GeneratedArmorMaterialParameters {
    brightness: number
    contrast: number
    hueR: number
    hueG: number
    hueB: number
}

interface AdminUtilsSettings {
    equipment: Record<PreviewSlot, number | null>
    materials: Record<PreviewSlot, number>
    atlasMaterials: Record<string, GeneratedArmorMaterialParameters>
    chainAtlasMaterials: Record<string, GeneratedArmorMaterialParameters>
    weaponAtlasMaterials: Record<string, GeneratedArmorMaterialParameters>
    sections: Record<AdminUtilsSection, boolean>
    animation: PreviewAnimation
}

const ADMIN_UTILS_STORAGE_KEY = 'darkenlight.adminUtils.settings.v1'
const PREVIEW_ANIMATIONS: PreviewAnimation[] = ['idle', 'walk', 'run', 'combatIdle', 'slash', 'jab', 'death']
const MODIFIER_COMPONENTS: ModifierComponent[] = ['scale', 'position', 'rotation']
const MODIFIER_AXES: ModifierAxis[] = ['x', 'y', 'z']
const GENERATED_ARMOR_ATLAS_SIZE = 1024
const GENERATED_ARMOR_ATLAS_COLUMNS = 4
const GENERATED_ARMOR_TILE_SIZE = GENERATED_ARMOR_ATLAS_SIZE / GENERATED_ARMOR_ATLAS_COLUMNS
const PLATE_ARMOR_PRIMARY_TEXTURE = '/models/equip/armors/plate_armor_primary.png?v=20261020-generated-atlas'
const PLATE_ARMOR_SECONDARY_TEXTURE = '/models/equip/armors/plate_armor_secondary.png?v=20261020-generated-atlas'
const PLATE_HELMET_PRIMARY_TEXTURE = '/models/equip/armors/plate_helmet_primary.png?v=20261020-generated-atlas'
const PLATE_HELMET_SECONDARY_TEXTURE = '/models/equip/armors/plate_helmet_secondary.png?v=20261020-generated-atlas'
const PLATE_PAULDRON_PRIMARY_TEXTURE = '/models/equip/armors/plate_pauldron_primary.png?v=20261020-generated-atlas'
const PLATE_PAULDRON_SECONDARY_TEXTURE = '/models/equip/armors/plate_pauldron_secondary.png?v=20261020-generated-atlas'
const PLATE_LEG_PRIMARY_TEXTURE = '/models/equip/armors/plate_leg_primary.png?v=20261020-generated-atlas'
const PLATE_LEG_SECONDARY_TEXTURE = '/models/equip/armors/plate_leg_secondary.png?v=20261020-generated-atlas'
const SHIELD_PRIMARY_TEXTURE = '/models/equip/armors/shield_primary.png?v=20261021-generated-atlas'
const SHIELD_SECONDARY_TEXTURE = '/models/equip/armors/shield_secondary.png?v=20261021-generated-atlas'
const CHAIN_MAIL_PRIMARY_TEXTURE = '/models/equip/armors/chain_mail_primary.png?v=20261020-generated-atlas'
const CHAIN_MAIL_SECONDARY_TEXTURE = '/models/equip/armors/chain_mail_secondary.png?v=20261020-generated-atlas'
const CHAIN_COIF_PRIMARY_TEXTURE = '/models/equip/armors/chain_coif_primary.png?v=20261020-generated-atlas'
const CHAIN_COIF_SECONDARY_TEXTURE = '/models/equip/armors/chain_coif_secondary.png?v=20261020-generated-atlas'
const CHAIN_PAULDRON_PRIMARY_TEXTURE = '/models/equip/armors/chain_pauldron_primary.png?v=20261020-generated-atlas'
const CHAIN_PAULDRON_SECONDARY_TEXTURE = '/models/equip/armors/chain_pauldron_secondary.png?v=20261020-generated-atlas'
const CHAIN_LEG_PRIMARY_TEXTURE = '/models/equip/armors/chain_legs_primary.png?v=20261020-generated-atlas'
const CHAIN_LEG_SECONDARY_TEXTURE = '/models/equip/armors/chain_legs_secondary.png?v=20261020-generated-atlas'
const BROADSWORD_PRIMARY_TEXTURE = '/models/equip/weapons/broadsword_primary.png?v=20261021-generated-atlas'
const BROADSWORD_SECONDARY_TEXTURE = '/models/equip/weapons/broadsword_secondary.png?v=20261021-generated-atlas'
const LONGSWORD_PRIMARY_TEXTURE = '/models/equip/weapons/longsword_primary.png?v=20261021-generated-atlas'
const LONGSWORD_SECONDARY_TEXTURE = '/models/equip/weapons/longsword_secondary.png?v=20261021-generated-atlas'
const GREATAXE_PRIMARY_TEXTURE = '/models/equip/weapons/greataxe_primary.png?v=20261022-generated-atlas'
const GREATAXE_SECONDARY_TEXTURE = '/models/equip/weapons/greataxe_secondary.png?v=20261022-generated-atlas'

const MODEL_IDS = {
    longsword: 10,
    broadsword: 20,
    greataxe: 155,
    armorPlate: 1000,
    helm: 1100,
    pauldronsPlate: 1200,
    legsPlate: 1300,
    shield: 1400,
    chainMail: 2000,
    chainCoif: 2100,
    chainPauldrons: 2200,
    chainGreaves: 2300,
} as const

const defaultSlotSelections: Record<PreviewSlot, number | null> = {
    body: MODEL_IDS.armorPlate,
    head: MODEL_IDS.helm,
    pauldrons: MODEL_IDS.pauldronsPlate,
    legs: MODEL_IDS.legsPlate,
    shield: null,
    weapon: MODEL_IDS.broadsword,
}

const slotSelections = { ...defaultSlotSelections }
const defaultMaterialSelections: Record<PreviewSlot, number> = {
    body: 1,
    head: 1,
    pauldrons: 1,
    legs: 1,
    shield: 1,
    weapon: 1,
}
const slotMaterialSelections = { ...defaultMaterialSelections }
const sectionOpenStates: Record<AdminUtilsSection, boolean> = {
    materialAtlas: true,
    weaponMaterialAtlas: true,
    equipment: true,
}

const materialOptions: Array<{ label: string, value: number, atlasTile: number }> = [
    { label: 'Steel', value: 1, atlasTile: 0 },
    { label: 'Agapyte', value: 3, atlasTile: 1 },
    { label: 'Astracyte', value: 2, atlasTile: 2 },
    { label: 'Gold', value: 4, atlasTile: 3 },
    { label: 'Blood stone', value: 5, atlasTile: 4 },
    { label: 'Dark stone', value: 6, atlasTile: 5 },
    { label: 'Mythril', value: 8, atlasTile: 6 },
]

const weaponMaterialOptions: Array<{ label: string, value: number, atlasTile: number }> = [
    { label: 'Steel', value: 1, atlasTile: 0 },
    { label: 'Pyroxide', value: 2, atlasTile: 1 },
    { label: 'Geonite', value: 3, atlasTile: 2 },
    { label: 'Mythril', value: 4, atlasTile: 3 },
    { label: 'Chaotite', value: 5, atlasTile: 4 },
]

function getMaterialOptionsForSlot(slot: PreviewSlot) {
    return slot === 'weapon' ? weaponMaterialOptions : materialOptions
}

const slotOptions: Record<PreviewSlot, Array<{ label: string, value: number | null }>> = {
    body: [
        { label: 'Bez zbroje', value: null },
        { label: 'Plátová zbroj', value: MODEL_IDS.armorPlate },
        { label: 'Kroužková zbroj', value: MODEL_IDS.chainMail },
    ],
    head: [
        { label: 'Bez helmy', value: null },
        { label: 'Plátová helma', value: MODEL_IDS.helm },
        { label: 'Kroužková kukla', value: MODEL_IDS.chainCoif },
    ],
    pauldrons: [
        { label: 'Bez nárameníků', value: null },
        { label: 'Plátové nárameníky', value: MODEL_IDS.pauldronsPlate },
        { label: 'Kroužkové nárameníky', value: MODEL_IDS.chainPauldrons },
    ],
    legs: [
        { label: 'Bez náholenic', value: null },
        { label: 'Plátové náholenice', value: MODEL_IDS.legsPlate },
        { label: 'Kroužkové náholenice', value: MODEL_IDS.chainGreaves },
    ],
    shield: [
        { label: 'Bez štítu', value: null },
        { label: 'Štít', value: MODEL_IDS.shield },
    ],
    weapon: [
        { label: 'Bez zbraně', value: null },
        { label: 'Longsword', value: MODEL_IDS.longsword },
        { label: 'Broadsword', value: MODEL_IDS.broadsword },
        { label: 'Great axe', value: MODEL_IDS.greataxe },
    ],
}

const slotLabels: Record<PreviewSlot, string> = {
    body: 'Tělo',
    head: 'Hlava',
    pauldrons: 'Ramena',
    legs: 'Nohy',
    shield: 'Levá ruka',
    weapon: 'Pravá ruka',
}

const defaultGeneratedArmorMaterialParameters: GeneratedArmorMaterialParameters = {
    brightness: 0,
    contrast: 0,
    hueR: 0,
    hueG: 0,
    hueB: 0,
}

function createDefaultAtlasMaterialSettings(options = materialOptions): Record<string, GeneratedArmorMaterialParameters> {
    return Object.fromEntries(options.map((option) => [
        String(option.value),
        { ...defaultGeneratedArmorMaterialParameters },
    ]))
}

const plateAtlasMaterialSettings = createDefaultAtlasMaterialSettings()
const chainAtlasMaterialSettings = createDefaultAtlasMaterialSettings()
const weaponAtlasMaterialSettings = createDefaultAtlasMaterialSettings(weaponMaterialOptions)
const atlasMaterialSettingsByFamily: Record<MaterialFamily, Record<string, GeneratedArmorMaterialParameters>> = {
    plate: plateAtlasMaterialSettings,
    chain: chainAtlasMaterialSettings,
    weapon: weaponAtlasMaterialSettings,
}

function loadAtlasLayer(path: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error(`Could not load generated armor atlas layer: ${path}`))
        image.src = path
    })
}

interface ArmorAtlasLayers {
    primary: HTMLImageElement
    secondary: HTMLImageElement
    primaryOnTop: boolean
}

async function loadArmorAtlasLayers(primaryPath: string, secondaryPath: string, primaryOnTop = true): Promise<ArmorAtlasLayers> {
    const [primary, secondary] = await Promise.all([
        loadAtlasLayer(primaryPath),
        loadAtlasLayer(secondaryPath),
    ])
    return { primary, secondary, primaryOnTop }
}

function clampColorChannel(value: number): number {
    return Math.max(0, Math.min(255, Math.round(value)))
}

function createProcessedPrimaryLayer(
    primary: HTMLImageElement,
    parameters: GeneratedArmorMaterialParameters,
): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = GENERATED_ARMOR_TILE_SIZE
    canvas.height = GENERATED_ARMOR_TILE_SIZE
    const context = canvas.getContext('2d', { willReadFrequently: true })!
    context.drawImage(primary, 0, 0, GENERATED_ARMOR_TILE_SIZE, GENERATED_ARMOR_TILE_SIZE)

    const imageData = context.getImageData(0, 0, GENERATED_ARMOR_TILE_SIZE, GENERATED_ARMOR_TILE_SIZE)
    const pixels = imageData.data
    const contrast = parameters.contrast * 2.55
    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast))
    const brightnessOffset = parameters.brightness * 2.55
    const redOffset = parameters.hueR * 2.55
    const greenOffset = parameters.hueG * 2.55
    const blueOffset = parameters.hueB * 2.55

    for (let index = 0; index < pixels.length; index += 4) {
        pixels[index] = clampColorChannel(contrastFactor * (pixels[index] - 128) + 128 + brightnessOffset + redOffset)
        pixels[index + 1] = clampColorChannel(contrastFactor * (pixels[index + 1] - 128) + 128 + brightnessOffset + greenOffset)
        pixels[index + 2] = clampColorChannel(contrastFactor * (pixels[index + 2] - 128) + 128 + brightnessOffset + blueOffset)
    }
    context.putImageData(imageData, 0, 0)
    return canvas
}

function renderGeneratedArmorAtlas(
    texture: DynamicTexture,
    layers: ArmorAtlasLayers,
    materialSettings: Record<string, GeneratedArmorMaterialParameters>,
    options = materialOptions,
) {
    const context = texture.getContext() as unknown as CanvasRenderingContext2D
    context.clearRect(0, 0, GENERATED_ARMOR_ATLAS_SIZE, GENERATED_ARMOR_ATLAS_SIZE)
    const processedPrimaryLayers = new Map<number, HTMLCanvasElement>()
    options.forEach((option) => {
        processedPrimaryLayers.set(
            option.value,
            createProcessedPrimaryLayer(layers.primary, materialSettings[String(option.value)]),
        )
    })
    const fallbackPrimary = processedPrimaryLayers.get(options[0].value)!

    for (let tileIndex = 0; tileIndex < GENERATED_ARMOR_ATLAS_COLUMNS * GENERATED_ARMOR_ATLAS_COLUMNS; tileIndex++) {
        const tileX = tileIndex % GENERATED_ARMOR_ATLAS_COLUMNS
        const tileY = Math.floor(tileIndex / GENERATED_ARMOR_ATLAS_COLUMNS)
        const x = tileX * GENERATED_ARMOR_TILE_SIZE
        const y = tileY * GENERATED_ARMOR_TILE_SIZE
        const material = options.find((option) => option.atlasTile === tileIndex)
        const primary = material ? processedPrimaryLayers.get(material.value)! : fallbackPrimary
        if (layers.primaryOnTop) {
            context.drawImage(layers.secondary, x, y, GENERATED_ARMOR_TILE_SIZE, GENERATED_ARMOR_TILE_SIZE)
            context.drawImage(primary, x, y, GENERATED_ARMOR_TILE_SIZE, GENERATED_ARMOR_TILE_SIZE)
        } else {
            context.drawImage(primary, x, y, GENERATED_ARMOR_TILE_SIZE, GENERATED_ARMOR_TILE_SIZE)
            context.drawImage(layers.secondary, x, y, GENERATED_ARMOR_TILE_SIZE, GENERATED_ARMOR_TILE_SIZE)
        }
    }
    texture.update(false)
}

function createGeneratedArmorAtlas(
    scene: Scene,
    name: string,
    layers: ArmorAtlasLayers,
    materialSettings: Record<string, GeneratedArmorMaterialParameters>,
    options = materialOptions,
): DynamicTexture {
    const texture = new DynamicTexture(
        name,
        { width: GENERATED_ARMOR_ATLAS_SIZE, height: GENERATED_ARMOR_ATLAS_SIZE },
        scene,
        true,
        Texture.TRILINEAR_SAMPLINGMODE,
        undefined,
        false,
    )
    texture.gammaSpace = true
    texture.uScale = 1 / GENERATED_ARMOR_ATLAS_COLUMNS
    texture.vScale = 1 / GENERATED_ARMOR_ATLAS_COLUMNS
    renderGeneratedArmorAtlas(texture, layers, materialSettings, options)
    return texture
}

function normalizeAtlasParameter(value: unknown): number {
    const number = Number(value)
    return Number.isFinite(number) ? Math.max(-100, Math.min(100, number)) : 0
}

function getEquipAtlasIndex(atlasTile: number): number {
    const tileX = atlasTile % GENERATED_ARMOR_ATLAS_COLUMNS
    const tileY = Math.floor(atlasTile / GENERATED_ARMOR_ATLAS_COLUMNS)
    return (GENERATED_ARMOR_ATLAS_COLUMNS - 1 - tileY) * GENERATED_ARMOR_ATLAS_COLUMNS + tileX
}

function loadAdminUtilsSettings(): AdminUtilsSettings {
    const settings: AdminUtilsSettings = {
        equipment: { ...defaultSlotSelections },
        materials: { ...defaultMaterialSelections },
        atlasMaterials: createDefaultAtlasMaterialSettings(),
        chainAtlasMaterials: createDefaultAtlasMaterialSettings(),
        weaponAtlasMaterials: createDefaultAtlasMaterialSettings(weaponMaterialOptions),
        sections: { materialAtlas: true, weaponMaterialAtlas: true, equipment: true },
        animation: 'idle',
    }

    try {
        const storedValue = localStorage.getItem(ADMIN_UTILS_STORAGE_KEY)
        if (storedValue == null) return settings

        const stored = JSON.parse(storedValue) as Partial<AdminUtilsSettings> & { materialVariant?: number }
        ;(Object.keys(slotOptions) as PreviewSlot[]).forEach((slot) => {
            const storedModelId = stored.equipment?.[slot]
            if (storedModelId !== undefined && slotOptions[slot].some((option) => option.value === storedModelId)) {
                settings.equipment[slot] = storedModelId
            }
            const storedMaterial = stored.materials?.[slot] ?? stored.materialVariant
            if (getMaterialOptionsForSlot(slot).some((option) => option.value === storedMaterial)) {
                settings.materials[slot] = storedMaterial!
            }
        })
        materialOptions.forEach((option) => {
            const storedParameters = stored.atlasMaterials?.[String(option.value)]
            if (storedParameters != null) {
                settings.atlasMaterials[String(option.value)] = {
                    brightness: normalizeAtlasParameter(storedParameters.brightness),
                    contrast: normalizeAtlasParameter(storedParameters.contrast),
                    hueR: normalizeAtlasParameter(storedParameters.hueR),
                    hueG: normalizeAtlasParameter(storedParameters.hueG),
                    hueB: normalizeAtlasParameter(storedParameters.hueB),
                }
            }
            const storedChainParameters = stored.chainAtlasMaterials?.[String(option.value)]
            if (storedChainParameters != null) {
                settings.chainAtlasMaterials[String(option.value)] = {
                    brightness: normalizeAtlasParameter(storedChainParameters.brightness),
                    contrast: normalizeAtlasParameter(storedChainParameters.contrast),
                    hueR: normalizeAtlasParameter(storedChainParameters.hueR),
                    hueG: normalizeAtlasParameter(storedChainParameters.hueG),
                    hueB: normalizeAtlasParameter(storedChainParameters.hueB),
                }
            }
        })
        weaponMaterialOptions.forEach((option) => {
            const storedParameters = stored.weaponAtlasMaterials?.[String(option.value)]
            if (storedParameters != null) {
                settings.weaponAtlasMaterials[String(option.value)] = {
                    brightness: normalizeAtlasParameter(storedParameters.brightness),
                    contrast: normalizeAtlasParameter(storedParameters.contrast),
                    hueR: normalizeAtlasParameter(storedParameters.hueR),
                    hueG: normalizeAtlasParameter(storedParameters.hueG),
                    hueB: normalizeAtlasParameter(storedParameters.hueB),
                }
            }
        })

        if (typeof stored.sections?.materialAtlas === 'boolean') {
            settings.sections.materialAtlas = stored.sections.materialAtlas
        }
        if (typeof stored.sections?.weaponMaterialAtlas === 'boolean') {
            settings.sections.weaponMaterialAtlas = stored.sections.weaponMaterialAtlas
        }
        if (typeof stored.sections?.equipment === 'boolean') {
            settings.sections.equipment = stored.sections.equipment
        }

        if (PREVIEW_ANIMATIONS.includes(stored.animation as PreviewAnimation)) {
            settings.animation = stored.animation as PreviewAnimation
        }
    } catch (error) {
        console.warn('Stored admin utils settings could not be loaded:', error)
    }

    return settings
}

function saveAdminUtilsSettings(animation: string) {
    try {
        localStorage.setItem(ADMIN_UTILS_STORAGE_KEY, JSON.stringify({
            equipment: slotSelections,
            materials: slotMaterialSelections,
            atlasMaterials: plateAtlasMaterialSettings,
            chainAtlasMaterials: chainAtlasMaterialSettings,
            weaponAtlasMaterials: weaponAtlasMaterialSettings,
            sections: sectionOpenStates,
            animation,
        }))
    } catch (error) {
        console.warn('Admin utils settings could not be saved:', error)
    }
}

function createShell(root: HTMLElement) {
    root.innerHTML = `
        <main class="admin-utils">
            <section class="admin-utils__viewport">
                <canvas id="adminUtilsCanvas" aria-label="3D náhled postavy"></canvas>
                <div class="admin-utils__hint">Tažením otáčej · kolečkem přibližuj</div>
                <div id="adminUtilsStatus" class="admin-utils__status">Načítám modely…</div>
            </section>
            <aside class="admin-utils__panel">
                <div>
                    <p class="admin-utils__eyebrow">Darkenlight</p>
                    <h1>Admin Utils</h1>
                    <p class="admin-utils__intro">Offline laboratoř modelů. Nepřipojuje se k hernímu serveru.</p>
                </div>
                <details id="adminUtilsMaterialAtlasSection" class="admin-utils__section" open>
                    <summary><h2>Materiál Brnění</h2></summary>
                    <div id="adminUtilsMaterialAtlas" class="admin-utils__atlas-materials"></div>
                </details>
                <details id="adminUtilsWeaponMaterialAtlasSection" class="admin-utils__section" open>
                    <summary><h2>Materiál Zbraní</h2></summary>
                    <div id="adminUtilsWeaponMaterialAtlas" class="admin-utils__atlas-materials"></div>
                </details>
                <details id="adminUtilsEquipmentSection" class="admin-utils__section" open>
                    <summary><h2>Výbava postavy</h2></summary>
                    <div id="adminUtilsEquipment" class="admin-utils__controls"></div>
                </details>
                <section>
                    <h2>Animace</h2>
                    <label class="admin-utils__field">
                        <span>Přehrávaná animace</span>
                        <select id="adminUtilsAnimation" disabled>
                            <option value="idle">Idle</option>
                            <option value="walk">Chůze</option>
                            <option value="run">Běh</option>
                            <option value="combatIdle">Combat idle</option>
                            <option value="slash">Útok – slash</option>
                            <option value="jab">Útok – jab</option>
                            <option value="death">Smrt</option>
                        </select>
                    </label>
                </section>
                <a class="admin-utils__back" href="/">← Zpět do hry</a>
            </aside>
        </main>
    `
}

function createMaterialAtlasControls(
    container: HTMLElement,
    options: Array<{ label: string, value: number, atlasTile: number }>,
    families: MaterialFamily[],
) {
    options.forEach((material) => {
        const materialGroup = document.createElement('div')
        materialGroup.className = 'admin-utils__atlas-material-group'

        families.forEach((family) => {
            const group = document.createElement('fieldset')
            group.className = 'admin-utils__atlas-material'
            group.dataset.atlasFamily = family

            const legend = document.createElement('legend')
            legend.textContent = family === 'weapon'
                ? material.label
                : `${material.label} – ${family === 'plate' ? 'Plate' : 'Chain'}`
            group.append(legend)

            const createParameterInput = (parameter: AtlasMaterialParameter) => {
                const input = document.createElement('input')
                input.type = 'number'
                input.min = '-100'
                input.max = '100'
                input.step = '1'
                input.value = String(atlasMaterialSettingsByFamily[family][String(material.value)][parameter])
                input.dataset.atlasMaterial = String(material.value)
                input.dataset.atlasParameter = parameter
                return input
            }

            const parameters: Array<{ key: AtlasMaterialParameter, label: string }> = [
                { key: 'brightness', label: 'Brightness' },
                { key: 'contrast', label: 'Contrast' },
            ]
            parameters.forEach((parameter) => {
                const label = document.createElement('label')
                label.className = 'admin-utils__atlas-parameter'

                const title = document.createElement('span')
                title.textContent = parameter.label
                label.append(title, createParameterInput(parameter.key))
                group.append(label)
            })

            const hueGroup = document.createElement('div')
            hueGroup.className = 'admin-utils__atlas-hue'
            const hueTitle = document.createElement('span')
            hueTitle.textContent = 'Hue (RGB)'
            hueGroup.append(hueTitle)

            const hueFields = document.createElement('div')
            hueFields.className = 'admin-utils__atlas-hue-fields'
            const hueParameters: Array<{ key: AtlasMaterialParameter, label: string }> = [
                { key: 'hueR', label: 'R' },
                { key: 'hueG', label: 'G' },
                { key: 'hueB', label: 'B' },
            ]
            hueParameters.forEach((parameter) => {
                const label = document.createElement('label')
                const title = document.createElement('span')
                title.textContent = parameter.label
                label.append(title, createParameterInput(parameter.key))
                hueFields.append(label)
            })
            hueGroup.append(hueFields)
            group.append(hueGroup)

            const confirmButton = document.createElement('button')
            confirmButton.type = 'button'
            confirmButton.className = 'admin-utils__atlas-confirm'
            confirmButton.dataset.confirmAtlasMaterial = String(material.value)
            confirmButton.textContent = 'potvrdit'
            confirmButton.disabled = true
            group.append(confirmButton)
            materialGroup.append(group)
        })
        container.append(materialGroup)
    })
}

function readMaterialAtlasControls(root: HTMLElement) {
    const family = root.dataset.atlasFamily as MaterialFamily
    const materialSettings = atlasMaterialSettingsByFamily[family]
    root.querySelectorAll<HTMLInputElement>('[data-atlas-material][data-atlas-parameter]').forEach((input) => {
        const materialId = input.dataset.atlasMaterial!
        const parameter = input.dataset.atlasParameter as AtlasMaterialParameter
        const value = normalizeAtlasParameter(input.value)
        input.value = String(value)
        materialSettings[materialId][parameter] = value
    })
}

function exportAtlasAsJpeg(texture: DynamicTexture, fileName: string) {
    const context = texture.getContext() as unknown as CanvasRenderingContext2D
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = context.canvas.width
    exportCanvas.height = context.canvas.height
    const exportContext = exportCanvas.getContext('2d')!
    exportContext.fillStyle = '#000'
    exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height)
    exportContext.drawImage(context.canvas, 0, 0)
    exportCanvas.toBlob((blob) => {
        if (blob == null) return
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        link.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
    }, 'image/jpeg', 0.82)
}

function appendModifierControls(container: HTMLElement) {
    const header = document.createElement('div')
    header.className = 'admin-utils__modifier-row admin-utils__modifier-row--header'
    header.append(document.createElement('span'))
    MODIFIER_AXES.forEach((axis) => {
        const axisLabel = document.createElement('span')
        axisLabel.textContent = axis.toUpperCase()
        header.append(axisLabel)
    })
    container.append(header)

    MODIFIER_COMPONENTS.forEach((component) => {
        const row = document.createElement('label')
        row.className = 'admin-utils__modifier-row'

        const componentLabel = document.createElement('span')
        componentLabel.textContent = component
        row.append(componentLabel)

        MODIFIER_AXES.forEach((axis) => {
            const input = document.createElement('input')
            input.type = 'number'
            input.step = '0.001'
            input.dataset.modifierComponent = component
            input.dataset.modifierAxis = axis
            input.setAttribute('aria-label', `${component} ${axis}`)
            row.append(input)
        })
        container.append(row)
    })
}

function createEquipmentControls(container: HTMLElement) {
    (Object.keys(slotOptions) as PreviewSlot[]).forEach((slot) => {
        const group = document.createElement('div')
        group.className = 'admin-utils__equipment-group'

        const label = document.createElement('label')
        label.className = 'admin-utils__field'

        const title = document.createElement('span')
        title.textContent = slotLabels[slot]
        label.append(title)

        const select = document.createElement('select')
        select.dataset.slot = slot
        select.disabled = true
        slotOptions[slot].forEach((option) => {
            const element = document.createElement('option')
            element.value = option.value?.toString() ?? ''
            element.textContent = option.label
            element.selected = option.value === slotSelections[slot]
            select.append(element)
        })
        label.append(select)

        const materialLabel = document.createElement('label')
        materialLabel.className = 'admin-utils__field admin-utils__material-field'

        const materialTitle = document.createElement('span')
        materialTitle.textContent = 'Materiál'
        materialLabel.append(materialTitle)

        const materialSelect = document.createElement('select')
        materialSelect.dataset.materialSlot = slot
        materialSelect.disabled = true
        getMaterialOptionsForSlot(slot).forEach((option) => {
            const element = document.createElement('option')
            element.value = String(option.value)
            element.textContent = option.label
            element.selected = option.value === slotMaterialSelections[slot]
            materialSelect.append(element)
        })
        materialLabel.append(materialSelect)

        const toggle = document.createElement('button')
        toggle.type = 'button'
        toggle.className = 'admin-utils__modifier-toggle'
        toggle.dataset.modifierToggle = slot
        toggle.textContent = 'Editovat proporce'
        toggle.disabled = true

        const exportLink = document.createElement('a')
        exportLink.href = '#'
        exportLink.className = 'admin-utils__atlas-export'
        exportLink.dataset.exportAtlas = slot
        exportLink.textContent = 'Exportovat JPG'
        exportLink.setAttribute('aria-disabled', 'true')
        exportLink.tabIndex = -1

        const actions = document.createElement('div')
        actions.className = 'admin-utils__equipment-actions'
        actions.append(toggle, exportLink)

        const editor = document.createElement('div')
        editor.className = 'admin-utils__modifier-editor'
        editor.dataset.modifierEditor = slot
        editor.hidden = true

        if (slot === 'pauldrons') {
            ;(['left', 'right'] as PauldronSide[]).forEach((side) => {
                const sideEditor = document.createElement('div')
                sideEditor.className = 'admin-utils__modifier-side'
                sideEditor.dataset.modifierSide = side
                const sideTitle = document.createElement('strong')
                sideTitle.textContent = side === 'left' ? 'Levý pauldron' : 'Pravý pauldron'
                sideEditor.append(sideTitle)
                appendModifierControls(sideEditor)
                editor.append(sideEditor)
            })
        } else {
            appendModifierControls(editor)
        }

        group.append(label, materialLabel, actions, editor)
        container.append(group)
    })
}

function populateModifierEditor(editor: HTMLElement, modifier: EquipModelModifier | null) {
    const values: EquipModelModifier = modifier ?? {
        scale: Vector3.One(),
        position: Vector3.Zero(),
        rotation: Vector3.Zero(),
    }

    editor.querySelectorAll<HTMLInputElement>('[data-modifier-component]').forEach((input) => {
        const component = input.dataset.modifierComponent as ModifierComponent
        const axis = input.dataset.modifierAxis as ModifierAxis
        input.value = String(values[component][axis])
    })
}

function readModifierEditor(editor: HTMLElement): EquipModelModifier | null {
    const readVector = (component: ModifierComponent): Vector3 | null => {
        const values = MODIFIER_AXES.map((axis) => {
            const input = editor.querySelector<HTMLInputElement>(`[data-modifier-component="${component}"][data-modifier-axis="${axis}"]`)
            return Number(input?.value)
        })
        if (!values.every(Number.isFinite)) return null
        return new Vector3(values[0], values[1], values[2])
    }

    const scale = readVector('scale')
    const position = readVector('position')
    const rotation = readVector('rotation')
    if (scale == null || position == null || rotation == null) return null
    return { scale, position, rotation }
}

function createPreviewCharacter(): Character {
    return {
        id: -1,
        pos: Vector3.Zero(),
        logicYpos: 0,
        nameDisplayTime: 0,
        insideView: true,
        equipSet: new Map(),
        dead: false,
        attackAnimationTime: 1000,
        yMoveSpeed: 0,
        getModelHeight: () => 2,
        isMyChar: () => true,
        getMoveAngle: () => null,
        getLookAngle: () => null,
        getWeapon: () => null,
        getMoveType: () => 'W',
        getActualSpeed: () => 0,
        getFootStepSoundType: () => null,
        isRecentlyInCombat: () => false,
    } as unknown as Character
}

function setEquipmentSlot(model: CharacterModel, slot: PreviewSlot, modelId: number | null, materialIndex: number) {
    const modelSlots: Record<PreviewSlot, string> = {
        body: 'BODY',
        head: 'HEAD',
        pauldrons: 'PAULDRONS',
        legs: 'LEGS',
        shield: 'L_HAND',
        weapon: 'R_HAND',
    }

    model.removeEquippedItem(modelSlots[slot])
    slotSelections[slot] = modelId
    if (modelId == null) return

    switch (slot) {
        case 'body':
            model.assignArmor(modelId, materialIndex)
            break
        case 'head':
            model.assignHelmet(modelId, materialIndex)
            break
        case 'pauldrons':
            model.assignLeftPauldron(modelId, materialIndex)
            model.assignRightPauldron(modelId, materialIndex)
            break
        case 'legs':
            model.assignLeftLeg(modelId, materialIndex)
            model.assignRightLeg(modelId, materialIndex)
            break
        case 'shield':
            model.assignShield(modelId, materialIndex)
            break
        case 'weapon':
            model.assignWeapon(modelId, materialIndex)
            break
    }
}

function playAnimation(model: CharacterModel, animationName: string) {
    const animations = {
        idle: model.idleAnim,
        walk: model.walkAnim,
        run: model.runAnim,
        combatIdle: model.combatIdleAnim,
        slash: model.slashAnim,
        jab: model.jabAnim,
        death: model.deathAnim,
    }
    Object.values(animations).forEach((animation) => animation?.stop())
    const animation = animations[animationName as keyof typeof animations]
    animation?.start(!['slash', 'jab', 'death'].includes(animationName), 1)
}

export async function mountAdminUtils() {
    const root = document.querySelector<HTMLElement>('#appWrapper')
    if (!root) throw new Error('Missing #appWrapper element')

    const savedSettings = loadAdminUtilsSettings()
    Object.assign(slotSelections, savedSettings.equipment)
    Object.assign(slotMaterialSelections, savedSettings.materials)
    Object.assign(sectionOpenStates, savedSettings.sections)
    materialOptions.forEach((option) => {
        Object.assign(plateAtlasMaterialSettings[String(option.value)], savedSettings.atlasMaterials[String(option.value)])
        Object.assign(chainAtlasMaterialSettings[String(option.value)], savedSettings.chainAtlasMaterials[String(option.value)])
    })
    weaponMaterialOptions.forEach((option) => {
        Object.assign(weaponAtlasMaterialSettings[String(option.value)], savedSettings.weaponAtlasMaterials[String(option.value)])
    })

    document.title = 'Admin Utils · Darkenlight'
    createShell(root)
    createMaterialAtlasControls(root.querySelector('#adminUtilsMaterialAtlas')!, materialOptions, ['plate', 'chain'])
    createMaterialAtlasControls(root.querySelector('#adminUtilsWeaponMaterialAtlas')!, weaponMaterialOptions, ['weapon'])
    createEquipmentControls(root.querySelector('#adminUtilsEquipment')!)

    const canvas = root.querySelector<HTMLCanvasElement>('#adminUtilsCanvas')!
    const status = root.querySelector<HTMLElement>('#adminUtilsStatus')!
    const animationSelect = root.querySelector<HTMLSelectElement>('#adminUtilsAnimation')!
    const collapsibleSections: Array<[AdminUtilsSection, HTMLDetailsElement]> = [
        ['materialAtlas', root.querySelector<HTMLDetailsElement>('#adminUtilsMaterialAtlasSection')!],
        ['weaponMaterialAtlas', root.querySelector<HTMLDetailsElement>('#adminUtilsWeaponMaterialAtlasSection')!],
        ['equipment', root.querySelector<HTMLDetailsElement>('#adminUtilsEquipmentSection')!],
    ]
    const equipmentSelects = Array.from(root.querySelectorAll<HTMLSelectElement>('[data-slot]'))
    const materialSelects = Array.from(root.querySelectorAll<HTMLSelectElement>('[data-material-slot]'))
    const atlasMaterialConfirmButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-confirm-atlas-material]'))
    const atlasExportLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-export-atlas]'))
    const modifierToggles = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-modifier-toggle]'))
    const modifierEditors = Array.from(root.querySelectorAll<HTMLElement>('[data-modifier-editor]'))
    animationSelect.value = savedSettings.animation
    collapsibleSections.forEach(([section, details]) => {
        details.open = sectionOpenStates[section]
        details.addEventListener('toggle', () => {
            sectionOpenStates[section] = details.open
            saveAdminUtilsSettings(animationSelect.value)
        })
    })

    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true })
    const scene = new Scene(engine)
    scene.clearColor = new Color4(0.055, 0.082, 0.105, 1)

    // Renderer is initialized as the root of the existing game module graph.
    // Nothing is mounted and Connector.initialize() is never called here.
    const { Renderer } = await import('@/babylon/scene/renderer')
    Renderer.scene = scene
    const [
        { CharacterModel },
        { EquipManager },
        { WeaponsCbManager },
        { Materials },
        { Lights },
        { CharacterModelEquipModifiers, CharacterModelPauldronModifiers },
    ] = await Promise.all([
        import('@/babylon/character/characterModel'),
        import('@/babylon/item/equipManager'),
        import('@/babylon/item/codebook/weaponModelsCb'),
        import('@/babylon/materials'),
        import('@/babylon/scene/lights'),
        import('@/babylon/character/characterModelEquipModifiers'),
    ])

    const camera = new ArcRotateCamera('adminUtilsCamera', -Math.PI / 2, Math.PI / 2.35, 3.45, new Vector3(0, 1.05, 0), scene)
    camera.lowerRadiusLimit = 1.8
    camera.upperRadiusLimit = 9
    camera.lowerBetaLimit = 0.35
    camera.upperBetaLimit = Math.PI / 2.02
    camera.wheelPrecision = 45
    camera.panningSensibility = 0
    camera.attachControl(canvas, true)

    Lights.initialize(scene)
    Materials.initialize(scene)
    Lights.sunLight.intensity = 2.2

    const fillLight = new HemisphericLight('adminUtilsFillLight', Vector3.Up(), scene)
    fillLight.diffuse = new Color3(0.72, 0.8, 0.9)
    fillLight.groundColor = new Color3(0.18, 0.22, 0.16)
    fillLight.specular = new Color3(0.08, 0.08, 0.08)
    fillLight.intensity = 0.4

    const backLight = new DirectionalLight('adminUtilsBackLight', new Vector3(0.35, -0.45, -0.82), scene)
    backLight.diffuse = new Color3(0.9, 0.86, 0.78)
    backLight.specular = new Color3(0.12, 0.12, 0.12)
    backLight.intensity = 1.05

    const ground = MeshBuilder.CreateGround('adminUtilsGrass', { width: 12, height: 12, subdivisions: 2 }, scene)
    const grassMaterial = new StandardMaterial('adminUtilsGrassMaterial', scene)
    const grassTexture = new DynamicTexture('adminUtilsGrassTexture', 64, scene, false, Texture.NEAREST_SAMPLINGMODE)
    const grassContext = grassTexture.getContext()
    grassContext.fillStyle = '#294d21'
    grassContext.fillRect(0, 0, 64, 64)
    for (let index = 0; index < 180; index++) {
        const x = (index * 29) % 64
        const y = (index * 47) % 64
        grassContext.fillStyle = index % 3 === 0 ? '#3d662e' : index % 3 === 1 ? '#1d3e1a' : '#52783a'
        grassContext.fillRect(x, y, 1, 2 + (index % 3))
    }
    grassTexture.update()
    grassTexture.wrapU = Texture.WRAP_ADDRESSMODE
    grassTexture.wrapV = Texture.WRAP_ADDRESSMODE
    grassTexture.uScale = 12
    grassTexture.vScale = 12
    grassMaterial.diffuseTexture = grassTexture
    grassMaterial.diffuseColor = new Color3(0.72, 0.82, 0.68)
    grassMaterial.specularColor = new Color3(0.03, 0.05, 0.02)
    ground.material = grassMaterial
    ground.receiveShadows = true

    try {
        await EquipManager.initializeArmors(scene)
        await WeaponsCbManager.initLongsword(EquipManager.itemTypes, scene)
        await EquipManager.initializeBroadsword(scene)
        await WeaponsCbManager.initGreatAxe(EquipManager.itemTypes, scene)
        const longswordType = EquipManager.getItemType(MODEL_IDS.longsword)
        const longswordMaterial = longswordType?.mesh?.material
        const broadswordType = EquipManager.getItemType(MODEL_IDS.broadsword)
        const broadswordMaterial = broadswordType?.mesh?.material
        const greataxeType = EquipManager.getItemType(MODEL_IDS.greataxe)
        const greataxeMaterial = greataxeType?.mesh?.material
        const plateArmorType = EquipManager.getItemType(MODEL_IDS.armorPlate)
        const plateArmorMaterial = plateArmorType?.mesh?.material
        const plateHelmetType = EquipManager.getItemType(MODEL_IDS.helm)
        const plateHelmetMaterial = plateHelmetType?.mesh?.material
        const platePauldronType = EquipManager.getItemType(MODEL_IDS.pauldronsPlate)
        const platePauldronMaterial = platePauldronType?.mesh?.material
        const plateLegType = EquipManager.getItemType(MODEL_IDS.legsPlate)
        const plateLegMaterial = plateLegType?.mesh?.material
        const shieldType = EquipManager.getItemType(MODEL_IDS.shield)
        const shieldMaterial = shieldType?.mesh?.material
        const chainMailType = EquipManager.getItemType(MODEL_IDS.chainMail)
        const chainMailMaterial = chainMailType?.mesh?.material
        const chainCoifType = EquipManager.getItemType(MODEL_IDS.chainCoif)
        const chainCoifMaterial = chainCoifType?.mesh?.material
        const chainPauldronType = EquipManager.getItemType(MODEL_IDS.chainPauldrons)
        const chainPauldronMaterial = chainPauldronType?.mesh?.material
        const chainLegType = EquipManager.getItemType(MODEL_IDS.chainGreaves)
        const chainLegMaterial = chainLegType?.mesh?.material
        if (!(longswordMaterial instanceof PBRMaterial) || !(broadswordMaterial instanceof PBRMaterial) || !(greataxeMaterial instanceof PBRMaterial) || !(plateArmorMaterial instanceof PBRMaterial) || !(plateHelmetMaterial instanceof PBRMaterial) || !(platePauldronMaterial instanceof PBRMaterial) || !(plateLegMaterial instanceof PBRMaterial) || !(shieldMaterial instanceof PBRMaterial) || !(chainMailMaterial instanceof PBRMaterial) || !(chainCoifMaterial instanceof PBRMaterial) || !(chainPauldronMaterial instanceof PBRMaterial) || !(chainLegMaterial instanceof PBRMaterial)) {
            throw new Error('Equipment material is unavailable for generated atlas preview')
        }
        materialOptions.forEach((option) => {
            plateArmorType!.cbData.materialAtlasIndices?.set(option.value - 1, getEquipAtlasIndex(option.atlasTile))
            plateHelmetType!.cbData.materialAtlasIndices?.set(option.value - 1, getEquipAtlasIndex(option.atlasTile))
            platePauldronType!.cbData.materialAtlasIndices?.set(option.value - 1, getEquipAtlasIndex(option.atlasTile))
            plateLegType!.cbData.materialAtlasIndices?.set(option.value - 1, getEquipAtlasIndex(option.atlasTile))
            shieldType!.cbData.materialAtlasIndices?.set(option.value - 1, getEquipAtlasIndex(option.atlasTile))
            chainMailType!.cbData.materialAtlasIndices?.set(option.value - 1, getEquipAtlasIndex(option.atlasTile))
            chainCoifType!.cbData.materialAtlasIndices?.set(option.value - 1, getEquipAtlasIndex(option.atlasTile))
            chainPauldronType!.cbData.materialAtlasIndices?.set(option.value - 1, getEquipAtlasIndex(option.atlasTile))
            chainLegType!.cbData.materialAtlasIndices?.set(option.value - 1, getEquipAtlasIndex(option.atlasTile))
        })
        weaponMaterialOptions.forEach((option) => {
            longswordType!.cbData.materialAtlasIndices?.set(option.value - 1, getEquipAtlasIndex(option.atlasTile))
            broadswordType!.cbData.materialAtlasIndices?.set(option.value - 1, getEquipAtlasIndex(option.atlasTile))
            greataxeType!.cbData.materialAtlasIndices?.set(option.value - 1, getEquipAtlasIndex(option.atlasTile))
        })
        const [plateArmorLayers, plateHelmetLayers, platePauldronLayers, plateLegLayers, shieldLayers, chainMailLayers, chainCoifLayers, chainPauldronLayers, chainLegLayers, broadswordLayers, longswordLayers, greataxeLayers] = await Promise.all([
            loadArmorAtlasLayers(PLATE_ARMOR_PRIMARY_TEXTURE, PLATE_ARMOR_SECONDARY_TEXTURE),
            loadArmorAtlasLayers(PLATE_HELMET_PRIMARY_TEXTURE, PLATE_HELMET_SECONDARY_TEXTURE),
            loadArmorAtlasLayers(PLATE_PAULDRON_PRIMARY_TEXTURE, PLATE_PAULDRON_SECONDARY_TEXTURE),
            loadArmorAtlasLayers(PLATE_LEG_PRIMARY_TEXTURE, PLATE_LEG_SECONDARY_TEXTURE),
            loadArmorAtlasLayers(SHIELD_PRIMARY_TEXTURE, SHIELD_SECONDARY_TEXTURE),
            loadArmorAtlasLayers(CHAIN_MAIL_PRIMARY_TEXTURE, CHAIN_MAIL_SECONDARY_TEXTURE),
            loadArmorAtlasLayers(CHAIN_COIF_PRIMARY_TEXTURE, CHAIN_COIF_SECONDARY_TEXTURE),
            loadArmorAtlasLayers(CHAIN_PAULDRON_PRIMARY_TEXTURE, CHAIN_PAULDRON_SECONDARY_TEXTURE),
            loadArmorAtlasLayers(CHAIN_LEG_PRIMARY_TEXTURE, CHAIN_LEG_SECONDARY_TEXTURE),
            loadArmorAtlasLayers(BROADSWORD_PRIMARY_TEXTURE, BROADSWORD_SECONDARY_TEXTURE),
            loadArmorAtlasLayers(LONGSWORD_PRIMARY_TEXTURE, LONGSWORD_SECONDARY_TEXTURE),
            loadArmorAtlasLayers(GREATAXE_PRIMARY_TEXTURE, GREATAXE_SECONDARY_TEXTURE),
        ])
        const generatedPlateArmorAtlas = createGeneratedArmorAtlas(scene, 'adminUtilsGeneratedPlateArmorAtlas', plateArmorLayers, plateAtlasMaterialSettings)
        const generatedPlateHelmetAtlas = createGeneratedArmorAtlas(scene, 'adminUtilsGeneratedPlateHelmetAtlas', plateHelmetLayers, plateAtlasMaterialSettings)
        const generatedPlatePauldronAtlas = createGeneratedArmorAtlas(scene, 'adminUtilsGeneratedPlatePauldronAtlas', platePauldronLayers, plateAtlasMaterialSettings)
        const generatedPlateLegAtlas = createGeneratedArmorAtlas(scene, 'adminUtilsGeneratedPlateLegAtlas', plateLegLayers, plateAtlasMaterialSettings)
        const generatedShieldAtlas = createGeneratedArmorAtlas(scene, 'adminUtilsGeneratedShieldAtlas', shieldLayers, plateAtlasMaterialSettings)
        const generatedChainMailAtlas = createGeneratedArmorAtlas(scene, 'adminUtilsGeneratedChainMailAtlas', chainMailLayers, chainAtlasMaterialSettings)
        const generatedChainCoifAtlas = createGeneratedArmorAtlas(scene, 'adminUtilsGeneratedChainCoifAtlas', chainCoifLayers, chainAtlasMaterialSettings)
        const generatedChainPauldronAtlas = createGeneratedArmorAtlas(scene, 'adminUtilsGeneratedChainPauldronAtlas', chainPauldronLayers, chainAtlasMaterialSettings)
        const generatedChainLegAtlas = createGeneratedArmorAtlas(scene, 'adminUtilsGeneratedChainLegAtlas', chainLegLayers, chainAtlasMaterialSettings)
        const generatedBroadswordAtlas = createGeneratedArmorAtlas(
            scene,
            'adminUtilsGeneratedBroadswordAtlas',
            broadswordLayers,
            weaponAtlasMaterialSettings,
            weaponMaterialOptions,
        )
        const generatedLongswordAtlas = createGeneratedArmorAtlas(
            scene,
            'adminUtilsGeneratedLongswordAtlas',
            longswordLayers,
            weaponAtlasMaterialSettings,
            weaponMaterialOptions,
        )
        const generatedGreataxeAtlas = createGeneratedArmorAtlas(
            scene,
            'adminUtilsGeneratedGreataxeAtlas',
            greataxeLayers,
            weaponAtlasMaterialSettings,
            weaponMaterialOptions,
        )
        plateArmorMaterial.albedoTexture?.dispose()
        plateArmorMaterial.albedoTexture = generatedPlateArmorAtlas
        plateHelmetMaterial.albedoTexture?.dispose()
        plateHelmetMaterial.albedoTexture = generatedPlateHelmetAtlas
        platePauldronMaterial.albedoTexture?.dispose()
        platePauldronMaterial.albedoTexture = generatedPlatePauldronAtlas
        plateLegMaterial.albedoTexture?.dispose()
        plateLegMaterial.albedoTexture = generatedPlateLegAtlas
        shieldMaterial.albedoTexture?.dispose()
        shieldMaterial.albedoTexture = generatedShieldAtlas
        chainMailMaterial.albedoTexture?.dispose()
        chainMailMaterial.albedoTexture = generatedChainMailAtlas
        chainCoifMaterial.albedoTexture?.dispose()
        chainCoifMaterial.albedoTexture = generatedChainCoifAtlas
        chainPauldronMaterial.albedoTexture?.dispose()
        chainPauldronMaterial.albedoTexture = generatedChainPauldronAtlas
        chainLegMaterial.albedoTexture?.dispose()
        chainLegMaterial.albedoTexture = generatedChainLegAtlas
        broadswordMaterial.albedoTexture?.dispose()
        broadswordMaterial.albedoTexture = generatedBroadswordAtlas
        longswordMaterial.albedoTexture?.dispose()
        longswordMaterial.albedoTexture = generatedLongswordAtlas
        greataxeMaterial.albedoTexture?.dispose()
        greataxeMaterial.albedoTexture = generatedGreataxeAtlas

        const model = await CharacterModel.create(createPreviewCharacter(), true)
        model.node.rotation.y = Math.PI / 2

        ;(Object.keys(slotSelections) as PreviewSlot[]).forEach((slot) => {
            setEquipmentSlot(model, slot, slotSelections[slot], slotMaterialSelections[slot] - 1)
        })

        await Promise.all(model.model!.getChildMeshes().map((mesh) => Lights.warmLocalPlayerLightMaterial(mesh)))
        scene.meshes.forEach((mesh) => {
            if (mesh.material == null) return
            if (!mesh.lightSources.includes(fillLight)) mesh.lightSources.push(fillLight)
            if (!mesh.lightSources.includes(backLight)) mesh.lightSources.push(backLight)
            mesh._markSubMeshesAsLightDirty()
        })

        let expandedModifierSlot: PreviewSlot | null = null
        const closeModifierEditors = () => {
            modifierEditors.forEach((editor) => editor.hidden = true)
            modifierToggles.forEach((toggle) => toggle.classList.remove('admin-utils__modifier-toggle--expanded'))
            expandedModifierSlot = null
        }
        const populateSlotModifierEditor = (editor: HTMLElement, slot: PreviewSlot, modelId: number) => {
            if (slot !== 'pauldrons') {
                populateModifierEditor(editor, CharacterModelEquipModifiers.get(modelId) ?? null)
                return
            }
            const pairedModifiers = CharacterModelPauldronModifiers.get(modelId)
            ;(['left', 'right'] as PauldronSide[]).forEach((side) => {
                const sideEditor = editor.querySelector<HTMLElement>(`[data-modifier-side="${side}"]`)!
                populateModifierEditor(sideEditor, pairedModifiers?.[side] ?? null)
            })
        }
        const refreshModifierControl = (slot: PreviewSlot) => {
            const modelId = slotSelections[slot]
            const toggle = root.querySelector<HTMLButtonElement>(`[data-modifier-toggle="${slot}"]`)!
            const editor = root.querySelector<HTMLElement>(`[data-modifier-editor="${slot}"]`)!
            const materialSelect = root.querySelector<HTMLSelectElement>(`[data-material-slot="${slot}"]`)!
            const exportLink = root.querySelector<HTMLAnchorElement>(`[data-export-atlas="${slot}"]`)!
            toggle.disabled = modelId == null
            materialSelect.disabled = modelId == null
            const canExportAtlas = modelId === MODEL_IDS.longsword || modelId === MODEL_IDS.broadsword || modelId === MODEL_IDS.greataxe || modelId === MODEL_IDS.armorPlate || modelId === MODEL_IDS.helm || modelId === MODEL_IDS.pauldronsPlate || modelId === MODEL_IDS.legsPlate || modelId === MODEL_IDS.shield || modelId === MODEL_IDS.chainMail || modelId === MODEL_IDS.chainCoif || modelId === MODEL_IDS.chainPauldrons || modelId === MODEL_IDS.chainGreaves
            exportLink.setAttribute('aria-disabled', String(!canExportAtlas))
            exportLink.tabIndex = canExportAtlas ? 0 : -1
            exportLink.title = canExportAtlas ? '' : 'Export atlasu není pro tento typ výbavy dostupný'
            if (modelId == null) {
                if (expandedModifierSlot === slot) closeModifierEditors()
                return
            }
            if (expandedModifierSlot === slot) {
                populateSlotModifierEditor(editor, slot, modelId)
            }
        }

        modifierToggles.forEach((toggle) => {
            const slot = toggle.dataset.modifierToggle as PreviewSlot
            refreshModifierControl(slot)
            toggle.addEventListener('click', () => {
                if (expandedModifierSlot === slot) {
                    closeModifierEditors()
                    return
                }

                const modelId = slotSelections[slot]
                if (modelId == null) return
                closeModifierEditors()
                const editor = root.querySelector<HTMLElement>(`[data-modifier-editor="${slot}"]`)!
                populateSlotModifierEditor(editor, slot, modelId)
                editor.hidden = false
                toggle.classList.add('admin-utils__modifier-toggle--expanded')
                expandedModifierSlot = slot
            })
        })

        modifierEditors.forEach((editor) => {
            editor.addEventListener('input', (event) => {
                const slot = editor.dataset.modifierEditor as PreviewSlot
                const modelId = slotSelections[slot]
                if (modelId == null) return
                const sideEditor = slot === 'pauldrons'
                    ? (event.target as HTMLElement).closest<HTMLElement>('[data-modifier-side]')
                    : editor
                if (sideEditor == null) return
                const modifier = readModifierEditor(sideEditor)
                if (modifier == null) return

                if (slot === 'pauldrons') {
                    const side = sideEditor.dataset.modifierSide as PauldronSide
                    const pairedModifiers = CharacterModelPauldronModifiers.get(modelId)
                    if (pairedModifiers == null) return
                    pairedModifiers[side] = modifier
                } else {
                    CharacterModelEquipModifiers.set(modelId, modifier)
                }
                setEquipmentSlot(model, slot, modelId, slotMaterialSelections[slot] - 1)
            })
        })

        equipmentSelects.forEach((select) => {
            select.disabled = false
            select.addEventListener('change', () => {
                const value = select.value === '' ? null : Number(select.value)
                const slot = select.dataset.slot as PreviewSlot
                setEquipmentSlot(model, slot, value, slotMaterialSelections[slot] - 1)
                refreshModifierControl(slot)
                saveAdminUtilsSettings(animationSelect.value)
            })
        })

        materialSelects.forEach((select) => {
            select.addEventListener('change', () => {
                const slot = select.dataset.materialSlot as PreviewSlot
                const materialId = Number(select.value)
                slotMaterialSelections[slot] = materialId
                setEquipmentSlot(model, slot, slotSelections[slot], materialId - 1)
                saveAdminUtilsSettings(animationSelect.value)
            })
        })

        atlasMaterialConfirmButtons.forEach((button) => {
            button.disabled = false
            button.addEventListener('click', () => {
                const materialControls = button.closest<HTMLElement>('.admin-utils__atlas-material')!
                const family = materialControls.dataset.atlasFamily as MaterialFamily
                readMaterialAtlasControls(materialControls)
                if (family === 'plate') {
                    renderGeneratedArmorAtlas(generatedPlateArmorAtlas, plateArmorLayers, plateAtlasMaterialSettings)
                    renderGeneratedArmorAtlas(generatedPlateHelmetAtlas, plateHelmetLayers, plateAtlasMaterialSettings)
                    renderGeneratedArmorAtlas(generatedPlatePauldronAtlas, platePauldronLayers, plateAtlasMaterialSettings)
                    renderGeneratedArmorAtlas(generatedPlateLegAtlas, plateLegLayers, plateAtlasMaterialSettings)
                    renderGeneratedArmorAtlas(generatedShieldAtlas, shieldLayers, plateAtlasMaterialSettings)
                } else if (family === 'chain') {
                    renderGeneratedArmorAtlas(generatedChainMailAtlas, chainMailLayers, chainAtlasMaterialSettings)
                    renderGeneratedArmorAtlas(generatedChainCoifAtlas, chainCoifLayers, chainAtlasMaterialSettings)
                    renderGeneratedArmorAtlas(generatedChainPauldronAtlas, chainPauldronLayers, chainAtlasMaterialSettings)
                    renderGeneratedArmorAtlas(generatedChainLegAtlas, chainLegLayers, chainAtlasMaterialSettings)
                } else {
                    renderGeneratedArmorAtlas(generatedLongswordAtlas, longswordLayers, weaponAtlasMaterialSettings, weaponMaterialOptions)
                    renderGeneratedArmorAtlas(generatedBroadswordAtlas, broadswordLayers, weaponAtlasMaterialSettings, weaponMaterialOptions)
                    renderGeneratedArmorAtlas(generatedGreataxeAtlas, greataxeLayers, weaponAtlasMaterialSettings, weaponMaterialOptions)
                }
                saveAdminUtilsSettings(animationSelect.value)
                button.textContent = 'hotovo'
                window.setTimeout(() => button.textContent = 'potvrdit', 900)
            })
        })

        atlasExportLinks.forEach((link) => {
            link.addEventListener('click', (event) => {
                event.preventDefault()
                const slot = link.dataset.exportAtlas as PreviewSlot
                const modelId = slotSelections[slot]
                if (modelId === MODEL_IDS.longsword) {
                    exportAtlasAsJpeg(generatedLongswordAtlas, 'longsword.jpg')
                } else if (modelId === MODEL_IDS.broadsword) {
                    exportAtlasAsJpeg(generatedBroadswordAtlas, 'broadsword.jpg')
                } else if (modelId === MODEL_IDS.greataxe) {
                    exportAtlasAsJpeg(generatedGreataxeAtlas, 'greataxe.jpg')
                } else if (modelId === MODEL_IDS.armorPlate) {
                    exportAtlasAsJpeg(generatedPlateArmorAtlas, 'plate_armor.jpg')
                } else if (modelId === MODEL_IDS.helm) {
                    exportAtlasAsJpeg(generatedPlateHelmetAtlas, 'plate_helmet.jpg')
                } else if (modelId === MODEL_IDS.pauldronsPlate) {
                    exportAtlasAsJpeg(generatedPlatePauldronAtlas, 'plate_pauldron.jpg')
                } else if (modelId === MODEL_IDS.legsPlate) {
                    exportAtlasAsJpeg(generatedPlateLegAtlas, 'plate_leg.jpg')
                } else if (modelId === MODEL_IDS.shield) {
                    exportAtlasAsJpeg(generatedShieldAtlas, 'shield.jpg')
                } else if (modelId === MODEL_IDS.chainMail) {
                    exportAtlasAsJpeg(generatedChainMailAtlas, 'chain_mail.jpg')
                } else if (modelId === MODEL_IDS.chainCoif) {
                    exportAtlasAsJpeg(generatedChainCoifAtlas, 'chain_coif.jpg')
                } else if (modelId === MODEL_IDS.chainPauldrons) {
                    exportAtlasAsJpeg(generatedChainPauldronAtlas, 'chain_pauldron.jpg')
                } else if (modelId === MODEL_IDS.chainGreaves) {
                    exportAtlasAsJpeg(generatedChainLegAtlas, 'chain_leg.jpg')
                }
            })
        })

        animationSelect.disabled = false
        playAnimation(model, savedSettings.animation)
        animationSelect.addEventListener('change', () => {
            playAnimation(model, animationSelect.value)
            saveAdminUtilsSettings(animationSelect.value)
        })

        status.textContent = 'Model připraven'
        status.classList.add('admin-utils__status--ready')
        window.setTimeout(() => status.classList.add('admin-utils__status--hidden'), 1200)

        engine.runRenderLoop(() => {
            model.model?.computeWorldMatrix(true)
            if (model.model) {
                model.worldMatrix.copyFrom(model.model.getWorldMatrix())
                model.worldMatrix.decompose(undefined, model.rotationQuaternion, undefined)
            }
            model.equipSet.forEach((item) => item.onFrame())
            EquipManager.onFrame()
            scene.render()
        })
    } catch (error) {
        console.error('Admin character preview failed to initialize:', error)
        status.textContent = 'Model se nepodařilo načíst. Podrobnosti jsou v konzoli.'
        status.classList.add('admin-utils__status--error')
    }

    const resize = () => engine.resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pagehide', () => {
        window.removeEventListener('resize', resize)
        engine.dispose()
    }, { once: true })
}
