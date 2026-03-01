<template>
    <div v-if="dialogVisible" class="dialog-backdrop" @click.self="closeDialog">
        <div class="dialog-window adaptive model-render-dialog-window">
            <div class="dialog-header">Model Render</div>
            <div class="dialog-content model-render-dialog-content">
                <canvas ref="renderCanvasRef" class="model-render-canvas"></canvas>
                <div class="model-render-controls-placeholder">
                    <button class="dialog-button" @click="downloadCanvasPng">Stahnout PNG</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ArcRotateCamera, Color4, Engine, HemisphericLight, Mesh, Scene, SceneLoader, Vector2, Vector3 } from '@babylonjs/core'
import { Materials } from '@/babylon/materials'
import { WeaponModelsCb } from '@/babylon/item/codebook/weaponModelsCb'
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

const dialogVisible = ref(false)
const renderCanvasRef = ref(null)

let engine = null
let scene = null
let camera = null

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
    camera.alpha = -Math.PI / 4
    camera.beta = Math.PI / 2.8
}

const loadBowPreview = async () => {
    if (!scene) {
        return
    }

    const bowData = WeaponModelsCb.BOW
    const importResult = await SceneLoader.ImportMeshAsync('', '/models/equip/', `weapons/${bowData.model}.glb`, scene)
    const sourceMesh = importResult.meshes.find((m) => m instanceof Mesh && m.getTotalVertices() > 0)
    if (!sourceMesh) {
        return
    }

    const merged = Mesh.MergeMeshes([sourceMesh], true, true)
    if (!merged) {
        return
    }

    merged.position.copyFrom(bowData.pos ?? Vector3.Zero())
    merged.rotationQuaternion = null
    merged.rotation.copyFrom(bowData.rot ?? Vector3.Zero())
    merged.scaling.copyFrom(bowData.scale)

    const material = Materials.getPBRCustomMaterialFrom(
        scene,
        'modelRenderBowMaterial',
        '/models/equip/weapons/',
        'bow.png',
        1 / bowData.matCols,
        1 / bowData.matRows,
        false,
        {
            metallic: 0.25,
            roughness: 1,
            directIntensity: 1.5,
            environmentIntensity: 1,
        }
    )

    material.albedoTexture.vScale = -material.albedoTexture.vScale
    material.unfreeze()
    merged.material = material

    // Same atlas indexing logic as equip rendering; default to first material tile.
    applyAtlasIndexToMesh(merged, bowDtata.matCols, bowData.matRows, 0)
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
    scene.clearColor = new Color4(0.05, 0.05, 0.08, 1)

    camera = new ArcRotateCamera('modelRenderCamera', -Math.PI / 4, Math.PI / 3, 4, Vector3.Zero(), scene)
    camera.attachControl(canvas, true)

    const light = new HemisphericLight('modelRenderLight', new Vector3(0, 1, 0), scene)
    light.intensity = 1.1

    await loadBowPreview()

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

    const filename = `model-render-${Date.now()}.png`
    canvas.toBlob((blob) => {
        if (!blob) {
            return
        }
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        link.click()
        URL.revokeObjectURL(url)
    }, 'image/png')
}

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
    width: 336px;
    max-width: min(336px, 94vw);
}

.model-render-dialog-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 8px;
}

.model-render-canvas {
    width: 300px;
    height: 300px;
    display: block;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: #0d0d12;
}

.model-render-controls-placeholder {
    width: 300px;
    min-height: 42px;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.03);
    display: flex;
    align-items: center;
    justify-content: center;
}
</style>

