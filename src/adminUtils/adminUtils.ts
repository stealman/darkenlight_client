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
    Scene,
    StandardMaterial,
    Texture,
    Vector3,
} from '@babylonjs/core'
import type Character from '@/babylon/character/character'
import type { CharacterModel } from '@/babylon/character/characterModel'
import type { EquipModelModifier } from '@/babylon/item/equipManager'
import './styles.css'

type PreviewSlot = 'body' | 'head' | 'pauldrons' | 'legs' | 'shield'
type PreviewAnimation = 'idle' | 'walk' | 'run' | 'combatIdle' | 'slash' | 'jab' | 'death'
type ModifierComponent = 'scale' | 'position' | 'rotation'
type ModifierAxis = 'x' | 'y' | 'z'

interface AdminUtilsSettings {
    equipment: Record<PreviewSlot, number | null>
    materialVariant: number
    animation: PreviewAnimation
}

const ADMIN_UTILS_STORAGE_KEY = 'darkenlight.adminUtils.settings.v1'
const PREVIEW_ANIMATIONS: PreviewAnimation[] = ['idle', 'walk', 'run', 'combatIdle', 'slash', 'jab', 'death']
const MODIFIER_COMPONENTS: ModifierComponent[] = ['scale', 'position', 'rotation']
const MODIFIER_AXES: ModifierAxis[] = ['x', 'y', 'z']

const MODEL_IDS = {
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
}

const slotSelections = { ...defaultSlotSelections }

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
}

const slotLabels: Record<PreviewSlot, string> = {
    body: 'Tělo',
    head: 'Hlava',
    pauldrons: 'Ramena',
    legs: 'Nohy',
    shield: 'Levá ruka',
}

function loadAdminUtilsSettings(): AdminUtilsSettings {
    const settings: AdminUtilsSettings = {
        equipment: { ...defaultSlotSelections },
        materialVariant: 1,
        animation: 'idle',
    }

    try {
        const storedValue = localStorage.getItem(ADMIN_UTILS_STORAGE_KEY)
        if (storedValue == null) return settings

        const stored = JSON.parse(storedValue) as Partial<AdminUtilsSettings>
        ;(Object.keys(slotOptions) as PreviewSlot[]).forEach((slot) => {
            const storedModelId = stored.equipment?.[slot]
            if (storedModelId !== undefined && slotOptions[slot].some((option) => option.value === storedModelId)) {
                settings.equipment[slot] = storedModelId
            }
        })

        if (Number.isInteger(stored.materialVariant) && stored.materialVariant! >= 1 && stored.materialVariant! <= 128) {
            settings.materialVariant = stored.materialVariant!
        }
        if (PREVIEW_ANIMATIONS.includes(stored.animation as PreviewAnimation)) {
            settings.animation = stored.animation as PreviewAnimation
        }
    } catch (error) {
        console.warn('Stored admin utils settings could not be loaded:', error)
    }

    return settings
}

function saveAdminUtilsSettings(materialVariant: number, animation: string) {
    try {
        localStorage.setItem(ADMIN_UTILS_STORAGE_KEY, JSON.stringify({
            equipment: slotSelections,
            materialVariant,
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
                <section>
                    <h2>Výbava postavy</h2>
                    <div id="adminUtilsEquipment" class="admin-utils__controls"></div>
                    <label class="admin-utils__field">
                        <span>Varianta materiálu</span>
                        <input id="adminUtilsMaterial" type="number" min="1" max="128" value="1" />
                    </label>
                </section>
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

        const toggle = document.createElement('button')
        toggle.type = 'button'
        toggle.className = 'admin-utils__modifier-toggle'
        toggle.dataset.modifierToggle = slot
        toggle.textContent = 'Editovat proporce'
        toggle.disabled = true

        const editor = document.createElement('div')
        editor.className = 'admin-utils__modifier-editor'
        editor.dataset.modifierEditor = slot
        editor.hidden = true

        const header = document.createElement('div')
        header.className = 'admin-utils__modifier-row admin-utils__modifier-row--header'
        header.append(document.createElement('span'))
        MODIFIER_AXES.forEach((axis) => {
            const axisLabel = document.createElement('span')
            axisLabel.textContent = axis.toUpperCase()
            header.append(axisLabel)
        })
        editor.append(header)

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
            editor.append(row)
        })

        group.append(label, toggle, editor)
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

    document.title = 'Admin Utils · Darkenlight'
    createShell(root)
    createEquipmentControls(root.querySelector('#adminUtilsEquipment')!)

    const canvas = root.querySelector<HTMLCanvasElement>('#adminUtilsCanvas')!
    const status = root.querySelector<HTMLElement>('#adminUtilsStatus')!
    const materialInput = root.querySelector<HTMLInputElement>('#adminUtilsMaterial')!
    const animationSelect = root.querySelector<HTMLSelectElement>('#adminUtilsAnimation')!
    const equipmentSelects = Array.from(root.querySelectorAll<HTMLSelectElement>('[data-slot]'))
    const modifierToggles = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-modifier-toggle]'))
    const modifierEditors = Array.from(root.querySelectorAll<HTMLElement>('[data-modifier-editor]'))
    materialInput.value = String(savedSettings.materialVariant)
    animationSelect.value = savedSettings.animation

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
        { Materials },
        { Lights },
        { CharacterModelEquipModifiers },
    ] = await Promise.all([
        import('@/babylon/character/characterModel'),
        import('@/babylon/item/equipManager'),
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
        const model = await CharacterModel.create(createPreviewCharacter(), true)
        model.node.rotation.y = Math.PI / 2

        ;(Object.keys(slotSelections) as PreviewSlot[]).forEach((slot) => {
            setEquipmentSlot(model, slot, slotSelections[slot], savedSettings.materialVariant - 1)
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
        const refreshModifierControl = (slot: PreviewSlot) => {
            const modelId = slotSelections[slot]
            const toggle = root.querySelector<HTMLButtonElement>(`[data-modifier-toggle="${slot}"]`)!
            const editor = root.querySelector<HTMLElement>(`[data-modifier-editor="${slot}"]`)!
            toggle.disabled = modelId == null
            if (modelId == null) {
                if (expandedModifierSlot === slot) closeModifierEditors()
                return
            }
            if (expandedModifierSlot === slot) {
                populateModifierEditor(editor, CharacterModelEquipModifiers.get(modelId) ?? null)
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
                populateModifierEditor(editor, CharacterModelEquipModifiers.get(modelId) ?? null)
                editor.hidden = false
                toggle.classList.add('admin-utils__modifier-toggle--expanded')
                expandedModifierSlot = slot
            })
        })

        modifierEditors.forEach((editor) => {
            editor.addEventListener('input', () => {
                const slot = editor.dataset.modifierEditor as PreviewSlot
                const modelId = slotSelections[slot]
                if (modelId == null) return
                const modifier = readModifierEditor(editor)
                if (modifier == null) return

                CharacterModelEquipModifiers.set(modelId, modifier)
                setEquipmentSlot(model, slot, modelId, Number(materialInput.value) - 1)
            })
        })

        equipmentSelects.forEach((select) => {
            select.disabled = false
            select.addEventListener('change', () => {
                const value = select.value === '' ? null : Number(select.value)
                const slot = select.dataset.slot as PreviewSlot
                setEquipmentSlot(model, slot, value, Number(materialInput.value) - 1)
                refreshModifierControl(slot)
                saveAdminUtilsSettings(Number(materialInput.value), animationSelect.value)
            })
        })

        materialInput.addEventListener('change', () => {
            const materialIndex = Math.max(0, Math.min(127, Number(materialInput.value) - 1 || 0))
            materialInput.value = String(materialIndex + 1)
            ;(Object.keys(slotSelections) as PreviewSlot[]).forEach((slot) => {
                setEquipmentSlot(model, slot, slotSelections[slot], materialIndex)
            })
            saveAdminUtilsSettings(materialIndex + 1, animationSelect.value)
        })

        animationSelect.disabled = false
        playAnimation(model, savedSettings.animation)
        animationSelect.addEventListener('change', () => {
            playAnimation(model, animationSelect.value)
            saveAdminUtilsSettings(Number(materialInput.value), animationSelect.value)
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
