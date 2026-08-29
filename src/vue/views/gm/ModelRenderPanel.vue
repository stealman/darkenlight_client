<template>
    <div v-if="dialogVisible" class="dialog-backdrop" @click.self="closeDialog">
        <div class="dialog-window adaptive model-render-dialog-window">
            <div class="dialog-header">Model Render</div>
            <div class="dialog-content model-render-dialog-content">
                <div class="model-render-left-panel">
                    <label class="model-render-control">
                        <span>Image Variant</span>
                        <select v-model="imageVariant">
                            <option value="INVENTORY">INVENTORY</option>
                            <option value="DROP">DROP</option>
                        </select>
                    </label>
                    <label class="model-render-control">
                        <span>Type</span>
                        <select v-model="previewCategory">
                            <option value="WEAPON">WEAPON</option>
                            <option value="ARMOR">ARMOR</option>
                        </select>
                    </label>
                    <label class="model-render-control">
                        <span>Model</span>
                        <select v-model="selectedModelKey">
                            <option v-for="option in currentModelOptions" :key="option.key" :value="option.key">
                                {{ option.label }}
                            </option>
                        </select>
                    </label>
                    <label class="model-render-control">
                        <span>Material</span>
                        <select v-model.number="previewMatIndex">
                            <option v-for="option in materialIndexOptions" :key="option.index" :value="option.index">
                                {{ option.label }}
                            </option>
                        </select>
                    </label>
                    <label class="model-render-control">
                        <span>Metallic: {{ materialMetallic.toFixed(2) }}</span>
                        <input v-model.number="materialMetallic" type="range" min="0" max="1" step="0.01" @input="applyPreviewMaterialSettings">
                    </label>
                    <label class="model-render-control">
                        <span>Roughness: {{ materialRoughness.toFixed(2) }}</span>
                        <input v-model.number="materialRoughness" type="range" min="0" max="1" step="0.01" @input="applyPreviewMaterialSettings">
                    </label>
                    <label class="model-render-control">
                        <span>Direct Intensity: {{ materialDirectIntensity.toFixed(2) }}</span>
                        <input v-model.number="materialDirectIntensity" type="range" min="0" max="3" step="0.01" @input="applyPreviewMaterialSettings">
                    </label>
                    <label class="model-render-control">
                        <span>Environment Intensity: {{ materialEnvironmentIntensity.toFixed(2) }}</span>
                        <input v-model.number="materialEnvironmentIntensity" type="range" min="0" max="5" step="0.01" @input="applyPreviewMaterialSettings">
                    </label>
                </div>
                <div class="model-render-right-panel">
                    <canvas ref="renderCanvasRef" class="model-render-canvas"></canvas>
                    <div class="model-render-controls">
                        <div class="model-render-controls-grid">
                            <label class="model-render-control">
                                <span>Rot X: {{ rotationXDeg }}</span>
                                <input v-model.number="rotationXDeg" type="range" min="-180" max="180" step="1" @input="applyPreviewAdjustments">
                            </label>
                            <label class="model-render-control">
                                <span>Rot Y: {{ rotationYDeg }}</span>
                                <input v-model.number="rotationYDeg" type="range" min="-180" max="180" step="1" @input="applyPreviewAdjustments">
                            </label>
                            <label class="model-render-control">
                                <span>Rot Z: {{ rotationZDeg }}</span>
                                <input v-model.number="rotationZDeg" type="range" min="-180" max="180" step="1" @input="applyPreviewAdjustments">
                            </label>
                            <label class="model-render-control">
                                <span>Scale X: {{ scaleXMultiplier.toFixed(2) }}</span>
                                <input v-model.number="scaleXMultiplier" type="range" min="0" max="3" step="0.01" @input="applyPreviewAdjustments">
                            </label>
                            <label class="model-render-control">
                                <span>Scale Y: {{ scaleYMultiplier.toFixed(2) }}</span>
                                <input v-model.number="scaleYMultiplier" type="range" min="0" max="3" step="0.01" @input="applyPreviewAdjustments">
                            </label>
                            <label class="model-render-control">
                                <span>Scale Z: {{ scaleZMultiplier.toFixed(2) }}</span>
                                <input v-model.number="scaleZMultiplier" type="range" min="0" max="3" step="0.01" @input="applyPreviewAdjustments">
                            </label>
                        </div>
                        <div class="model-render-actions">
                            <button class="dialog-button model-render-action-button" @click="downloadCanvasPng">Save PNG</button>
                            <button class="dialog-button model-render-action-button" @click="centerPreviewMesh">Center</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ArcRotateCamera, Color3, Color4, CubeTexture, DirectionalLight, Engine, Mesh, Scene, SceneLoader, Vector2, Vector3 } from '@babylonjs/core'
import { Materials } from '@/babylon/materials'
import { WEAPON_MODEL_CACHE_VERSION, WeaponModelsCb } from '@/babylon/item/codebook/weaponModelsCb'
import { ARMOR_MATERIAL_METALIC, ArmorModelsCb, BASE_EQUIP_MATERIAL_PATH } from '@/babylon/item/codebook/armorsModelsCb'
import { VertexColorWeaponPalettesByModelKey } from '@/babylon/item/codebook/vertexColorPalettes'
import { createVertexColorWeaponMaterial } from '@/babylon/item/codebook/vertexColorPalettes/vertexColorWeaponMaterial'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Settings } from '@/settings/settings'
import { canvasToPngBlobWithTransparentColor } from '@/utils/pngUtils'

const MODEL_RENDER_SETTINGS_LS_KEY = 'model-render-settings'

const WEAPON_OPTIONS = Object.entries(VertexColorWeaponPalettesByModelKey).map(([key, weapon]) => {
    const item = WeaponModelsCb[key]
    return { key, item, ...weapon, label: `${key} (${item.model})` }
})
const ARMOR_OPTIONS = Object.entries(ArmorModelsCb).map(([key, item]) => ({ key, item, label: `${key} (${item.model})` }))

const dialogVisible = ref(false)
const renderCanvasRef = ref(null)
const imageVariant = ref('INVENTORY')
const rotationXDeg = ref(0)
const rotationYDeg = ref(0)
const rotationZDeg = ref(0)
const scaleXMultiplier = ref(1)
const scaleYMultiplier = ref(1)
const scaleZMultiplier = ref(1)
const previewCategory = ref('WEAPON')
const selectedModelKey = ref(WEAPON_OPTIONS[0]?.key ?? '')
const currentModelOptions = computed(() => (previewCategory.value === 'WEAPON' ? WEAPON_OPTIONS : ARMOR_OPTIONS))
const previewMatIndex = ref(0)
const materialMetallic = ref(0.75)
const materialRoughness = ref(1)
const materialDirectIntensity = ref(1.5)
const materialEnvironmentIntensity = ref(1)
const selectedPreviewOption = computed(() => {
    const options = previewCategory.value === 'WEAPON' ? WEAPON_OPTIONS : ARMOR_OPTIONS
    return options.find((option) => option.key === selectedModelKey.value) ?? null
})
const selectedPreviewItem = computed(() => {
    return selectedPreviewOption.value?.item ?? null
})
const selectedWeaponPalette = computed(() => previewCategory.value === 'WEAPON' ? selectedPreviewOption.value?.palette ?? null : null)
const currentMaterialSlots = computed(() => {
    const item = selectedPreviewItem.value
    if (!item) {
        return 0
    }
    if (selectedWeaponPalette.value) {
        return selectedWeaponPalette.value.materialColors.length
    }
    return item.matCols * item.matRows
})
const materialIndexOptions = computed(() => {
    const materialNames = selectedWeaponPalette.value?.materialNames
    return Array.from({ length: currentMaterialSlots.value }, (_, index) => ({
        index,
        label: materialNames?.[index] ?? `Material ${index + 1}`,
    }))
})

let engine = null
let scene = null
let camera = null
let previewMesh = null
let previewMaterial = null
let previewBaseRotation = null
let previewBaseScaling = null
let previewLoadId = 0

const CAMERA_PRESETS = {
    INVENTORY: {
        alpha: -Math.PI / 4,
        beta: Math.PI / 2.8,
    },
    DROP: {
        alpha: (-3 * Math.PI) / 4,
        beta: 0.88,
    },
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const getCurrentSettingsKey = () => `${previewCategory.value}_${selectedModelKey.value}_${imageVariant.value}`

const getStoredSettingsMap = () => {
    try {
        const raw = localStorage.getItem(MODEL_RENDER_SETTINGS_LS_KEY)
        if (!raw) {
            return {}
        }
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') {
            return {}
        }
        return parsed
    } catch {
        return {}
    }
}

const loadSettingsForCurrentSelection = () => {
    const settingsMap = getStoredSettingsMap()
    const settings = settingsMap[getCurrentSettingsKey()]
    if (!settings || typeof settings !== 'object') {
        rotationXDeg.value = 0
        rotationYDeg.value = 0
        rotationZDeg.value = 0
        scaleXMultiplier.value = 1
        scaleYMultiplier.value = 1
        scaleZMultiplier.value = 1
        materialMetallic.value = 0.75
        materialRoughness.value = 1
        materialDirectIntensity.value = 1.5
        materialEnvironmentIntensity.value = 1
        return
    }

    rotationXDeg.value = clamp(Number(settings.rotationXDeg ?? 0), -180, 180)
    rotationYDeg.value = clamp(Number(settings.rotationYDeg ?? 0), -180, 180)
    rotationZDeg.value = clamp(Number(settings.rotationZDeg ?? 0), -180, 180)
    scaleXMultiplier.value = clamp(Number(settings.scaleXMultiplier ?? 1), 0, 3)
    scaleYMultiplier.value = clamp(Number(settings.scaleYMultiplier ?? 1), 0, 3)
    scaleZMultiplier.value = clamp(Number(settings.scaleZMultiplier ?? 1), 0, 3)
    materialMetallic.value = clamp(Number(settings.materialMetallic ?? 0.75), 0, 1)
    materialRoughness.value = clamp(Number(settings.materialRoughness ?? 1), 0, 1)
    materialDirectIntensity.value = clamp(Number(settings.materialDirectIntensity ?? 1.5), 0, 3)
    materialEnvironmentIntensity.value = clamp(Number(settings.materialEnvironmentIntensity ?? 1), 0, 5)
}

const persistSettingsForCurrentSelection = () => {
    const settingsMap = getStoredSettingsMap()
    settingsMap[getCurrentSettingsKey()] = {
        rotationXDeg: rotationXDeg.value,
        rotationYDeg: rotationYDeg.value,
        rotationZDeg: rotationZDeg.value,
        scaleXMultiplier: scaleXMultiplier.value,
        scaleYMultiplier: scaleYMultiplier.value,
        scaleZMultiplier: scaleZMultiplier.value,
        materialMetallic: materialMetallic.value,
        materialRoughness: materialRoughness.value,
        materialDirectIntensity: materialDirectIntensity.value,
        materialEnvironmentIntensity: materialEnvironmentIntensity.value,
    }
    localStorage.setItem(MODEL_RENDER_SETTINGS_LS_KEY, JSON.stringify(settingsMap))
}

const disposeScene = () => {
    if (scene) {
        scene.dispose()
        scene = null
    }
    if (engine) {
        engine.dispose()
        engine = null
    }
    camera = null
    previewMesh = null
    previewMaterial = null
    previewBaseRotation = null
    previewBaseScaling = null
}

const getAtlasUvcOffsets = (matCols, matsRows, matIndex, pad = 0) => {
    const tileX = matIndex % matCols
    const tileY = Math.floor(matIndex / matCols)

    const matCol = tileX + pad
    const matRow = matsRows - (tileY + (1 - pad))
    return new Vector2(matCol, matRow)
}

const applyAtlasIndexToMesh = (mesh, matCols, matRows, matIndex) => {
    const vertexCount = mesh.getTotalVertices()
    if (vertexCount <= 0) {
        return
    }

    const uvc = getAtlasUvcOffsets(matCols, matRows, matIndex)
    const uvcBuffer = new Float32Array(vertexCount * 2)
    for (let i = 0; i < vertexCount; i++) {
        uvcBuffer[i * 2] = uvc.x
        uvcBuffer[i * 2 + 1] = uvc.y
    }
    mesh.setVerticesData('uvc', uvcBuffer, true, 2)
}

const frameMesh = (mesh) => {
    if (!camera) {
        return
    }

    const bounds = mesh.getHierarchyBoundingVectors(true)
    const center = bounds.min.add(bounds.max).scale(0.5)
    const extent = bounds.max.subtract(bounds.min)
    const maxExtent = Math.max(extent.x, extent.y, extent.z)

    camera.target = center
    camera.radius = Math.max(maxExtent * 3.0, 0.8)
    const preset = CAMERA_PRESETS[imageVariant.value]
    camera.alpha = preset.alpha
    camera.beta = preset.beta
}

const degToRad = (deg) => (deg * Math.PI) / 180

const applyPreviewAdjustments = () => {
    if (!previewMesh || !previewBaseRotation || !previewBaseScaling) {
        return
    }

    const safeScaleX = Math.max(scaleXMultiplier.value ?? 1, 0)
    const safeScaleY = Math.max(scaleYMultiplier.value ?? 1, 0)
    const safeScaleZ = Math.max(scaleZMultiplier.value ?? 1, 0)
    scaleXMultiplier.value = safeScaleX
    scaleYMultiplier.value = safeScaleY
    scaleZMultiplier.value = safeScaleZ

    previewMesh.rotation.set(
        previewBaseRotation.x + degToRad(rotationXDeg.value || 0),
        previewBaseRotation.y + degToRad(rotationYDeg.value || 0),
        previewBaseRotation.z + degToRad(rotationZDeg.value || 0)
    )
    previewMesh.scaling.set(
        previewBaseScaling.x * safeScaleX,
        previewBaseScaling.y * safeScaleY,
        previewBaseScaling.z * safeScaleZ
    )
    previewMesh.computeWorldMatrix(true)
}

const getSelectedPreviewItem = () => {
    return selectedPreviewItem.value
}

const applyCurrentMaterialIndex = () => {
    const previewItem = getSelectedPreviewItem()
    if (!previewMesh || !previewItem) {
        return
    }
    const materialSlots = currentMaterialSlots.value
    const maxIndex = Math.max(materialSlots - 1, 0)
    const safeIndex = clamp(previewMatIndex.value, 0, maxIndex)
    if (safeIndex !== previewMatIndex.value) {
        previewMatIndex.value = safeIndex
    }
    const isWeapon = previewCategory.value === 'WEAPON'
    applyAtlasIndexToMesh(previewMesh, isWeapon ? materialSlots : previewItem.matCols, isWeapon ? 1 : previewItem.matRows, safeIndex)
}

const applyPreviewMaterialSettings = () => {
    const safeMetallic = clamp(materialMetallic.value ?? 0.75, 0, 1)
    const safeRoughness = clamp(materialRoughness.value ?? 1, 0, 1)
    const safeDirectIntensity = clamp(materialDirectIntensity.value ?? 1.5, 0, 3)
    const safeEnvironmentIntensity = clamp(materialEnvironmentIntensity.value ?? 1, 0, 5)

    materialMetallic.value = safeMetallic
    materialRoughness.value = safeRoughness
    materialDirectIntensity.value = safeDirectIntensity
    materialEnvironmentIntensity.value = safeEnvironmentIntensity

    if (!previewMaterial) {
        return
    }

    previewMaterial.metallic = safeMetallic
    previewMaterial.roughness = safeRoughness
    previewMaterial.directIntensity = safeDirectIntensity
    previewMaterial.environmentIntensity = safeEnvironmentIntensity
}

const loadPreview = async () => {
    if (!scene) {
        return
    }

    const previewItem = getSelectedPreviewItem()
    if (!previewItem) {
        return
    }

    const loadId = ++previewLoadId
    if (previewMesh) {
        previewMesh.dispose()
        previewMesh = null
    }
    previewMaterial = null

    const isWeapon = previewCategory.value === 'WEAPON'
    const weaponPalette = selectedWeaponPalette.value
    if (isWeapon && !weaponPalette) {
        return
    }
    const modelPath = isWeapon
        ? `weapons/${previewItem.model}.glb?v=${WEAPON_MODEL_CACHE_VERSION}`
        : `armors/${previewItem.model}.babylon`
    const importResult = await SceneLoader.ImportMeshAsync('', '/models/equip/', modelPath, scene)
    const sourceMeshes = importResult.meshes.filter((m) => m instanceof Mesh && m.getTotalVertices() > 0)
    if (sourceMeshes.length === 0) {
        return
    }

    const merged = Mesh.MergeMeshes(sourceMeshes, true, true)
    if (!merged) {
        return
    }
    if (loadId !== previewLoadId) {
        merged.dispose()
        return
    }

    merged.position.copyFrom(previewItem.pos ?? Vector3.Zero())
    merged.rotationQuaternion = null
    merged.rotation.copyFrom(previewItem.rot ?? Vector3.Zero())
    merged.scaling.copyFrom(previewItem.scale)
    previewMesh = merged
    previewBaseRotation = merged.rotation.clone()
    previewBaseScaling = merged.scaling.clone()
    loadSettingsForCurrentSelection()

    previewMaterial = isWeapon
        ? createVertexColorWeaponMaterial(`modelRenderMaterial-${previewItem.model}`, scene, weaponPalette)
        : Materials.getPBRCustomMaterialFrom(
            scene,
            `modelRenderMaterial-${previewCategory.value}-${previewItem.model}`,
            `${BASE_EQUIP_MATERIAL_PATH}armors/`,
            `${ARMOR_MATERIAL_METALIC}.png`,
            1 / previewItem.matCols,
            1 / previewItem.matRows,
            false,
            {
                metallic: materialMetallic.value,
                roughness: materialRoughness.value,
                directIntensity: materialDirectIntensity.value,
                environmentIntensity: materialEnvironmentIntensity.value,
            }
        )
    previewMaterial.unfreeze()
    merged.material = previewMaterial
    applyPreviewMaterialSettings()

    applyCurrentMaterialIndex()
    applyPreviewAdjustments()
    merged.computeWorldMatrix(true)
    frameMesh(merged)
}

const initScene = async () => {
    const canvas = renderCanvasRef.value
    if (!canvas || engine) {
        return
    }

    engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true })
    scene = new Scene(engine)
    scene.clearColor = new Color4(0, 0, 0, 1)
    scene.imageProcessingConfiguration.exposure = 1.2
    scene.environmentTexture = CubeTexture.CreateFromPrefilteredData('environment_specular.env', scene)
    scene.environmentIntensity = 0.3

    camera = new ArcRotateCamera('modelRenderCamera', -Math.PI / 4, Math.PI / 3, 4, Vector3.Zero(), scene)
    camera.detachControl()

    const light = new DirectionalLight('modelRenderSunLight', new Vector3(-0.75, -0.75, 0.3), scene)
    light.position = new Vector3(30, 30, 30)
    light.diffuse = new Color3(1, 0.91, 0.88)
    light.intensity = 1.5

    await loadPreview()

    engine.runRenderLoop(() => {
        scene?.render()
    })

    engine.resize()
}

const openDialog = () => {
    dialogVisible.value = true
    nextTick(() => {
        initScene().catch((error) => {
            console.error('Model render scene init failed', error)
        })
    })
}

const closeDialog = () => {
    dialogVisible.value = false
    disposeScene()
}

const onDialogKeyDown = (event) => {
    if (!dialogVisible.value) {
        return
    }
    if (event.key === 'Escape') {
        closeDialog()
    }
}

const onWindowResize = () => {
    if (!dialogVisible.value || !engine) {
        return
    }
    engine.resize()
}

const downloadCanvasPng = () => {
    const canvas = renderCanvasRef.value
    if (!canvas) {
        return
    }

    const previewItem = getSelectedPreviewItem()
    if (!previewItem) {
        return
    }
    persistSettingsForCurrentSelection()
    const materialName = selectedWeaponPalette.value?.materialNames[previewMatIndex.value]?.toLowerCase()
    const inventoryBaseName = selectedPreviewOption.value?.inventoryBaseName
    const imageBaseName = materialName && inventoryBaseName
        ? `${materialName}-${inventoryBaseName}`
        : previewItem.model
    const suffix = imageVariant.value === 'DROP' ? '_drop' : ''
    const filename = `${imageBaseName}${suffix}.png`
    canvasToPngBlobWithTransparentColor(canvas).then((blob) => {
        if (!blob) {
            return
        }
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        link.click()
        URL.revokeObjectURL(url)
    })
}

const centerPreviewMesh = () => {
    if (!previewMesh) {
        return
    }
    frameMesh(previewMesh)
}

watch(previewCategory, async () => {
    const firstOption = currentModelOptions.value[0]
    const nextKey = firstOption?.key ?? ''
    const keyChanged = selectedModelKey.value !== nextKey
    selectedModelKey.value = nextKey
    if (keyChanged || !dialogVisible.value || !scene) {
        return
    }
    await loadPreview()
})

watch(selectedModelKey, async () => {
    if (!dialogVisible.value || !scene) {
        return
    }
    await loadPreview()
})

watch(imageVariant, () => {
    loadSettingsForCurrentSelection()
    applyPreviewAdjustments()
    applyPreviewMaterialSettings()
    if (!camera || !previewMesh) {
        return
    }
    frameMesh(previewMesh)
})

watch(currentMaterialSlots, () => {
    const safeIndex = clamp(previewMatIndex.value, 0, Math.max(currentMaterialSlots.value - 1, 0))
    if (safeIndex !== previewMatIndex.value) {
        previewMatIndex.value = safeIndex
    }
})

watch(previewMatIndex, () => {
    applyCurrentMaterialIndex()
})

watch([materialMetallic, materialRoughness, materialDirectIntensity, materialEnvironmentIntensity], () => {
    applyPreviewMaterialSettings()
})

onMounted(() => {
    window.addEventListener('keydown', onDialogKeyDown)
    window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
    window.removeEventListener('keydown', onDialogKeyDown)
    window.removeEventListener('resize', onWindowResize)
    disposeScene()
})

defineExpose({
    openDialog,
})
</script>

<style scoped>
.model-render-dialog-window {
    width: 672px;
    max-width: min(672px, 94vw);
}

.model-render-dialog-content {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    flex-wrap: nowrap;
    gap: 8px;
    padding: 8px;
}

.model-render-left-panel {
    width: 200px;
    max-width: 100%;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.03);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
}

.model-render-right-panel {
    width: 440px;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}

.model-render-canvas {
    width: 300px;
    height: 300px;
    display: block;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: #0d0d12;
}

.model-render-controls {
    width: 100%;
    max-width: 100%;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.03);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
}

.model-render-controls-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
}

.model-render-control {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 11px;
}

.model-render-control input {
    width: 100%;
}

.model-render-control select {
    width: 100%;
}

.model-render-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.model-render-action-button {
    width: 100%;
}
</style>
