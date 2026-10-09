<template>
    <div>
        <label>Fog areas: {{ areas.length }}</label>
        <p>Click empty ground to create an area, or click inside an existing ellipse to select it.</p>

        <div v-if="selectedArea" class="fog-editor">
            <strong>{{ selectedArea.id ? `Fog area #${selectedArea.id}` : 'New fog area' }}</strong>
            <span>Position: {{ selectedArea.x }}, {{ selectedArea.z }}</span>

            <label>Width
                <input v-model.number="selectedArea.width" type="number" min="1" max="128" step="1" :disabled="locked" @input="refreshPreview" />
            </label>
            <label>Depth
                <input v-model.number="selectedArea.depth" type="number" min="1" max="128" step="1" :disabled="locked" @input="refreshPreview" />
            </label>
            <label>Rotation
                <input v-model.number="selectedArea.rotation" type="number" min="0" max="359" step="5" :disabled="locked" @input="refreshPreview" />
            </label>
            <label>Intensity (1–10)
                <input v-model.number="selectedArea.intensity" type="number" min="1" max="10" step="1" :disabled="locked" @input="refreshPreview" />
            </label>

            <div class="fog-actions">
                <template v-if="selectedArea.id && !selectedAction">
                    <button @click="selectedAction = 'EDIT'">Edit</button>
                    <button @click="selectedAction = 'MOVE'">Move</button>
                    <button class="danger" @click="remove">Delete</button>
                </template>
                <template v-else-if="selectedArea.id && selectedAction === 'EDIT'">
                    <button @click="saveEdit">Save</button>
                    <button @click="cancel">Cancel</button>
                </template>
                <template v-else-if="selectedAction === 'MOVE'">
                    <span>Click the new center in the world.</span>
                    <button @click="cancel">Cancel</button>
                </template>
                <template v-else>
                    <button @click="saveCreate">Create</button>
                    <button @click="cancel">Cancel</button>
                </template>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { GMFoggyAreas } from '@/gm/GmFoggyAreas'
import { FoggyAreaManager } from '@/babylon/world/foggyAreaManager'

const areas = FoggyAreaManager.areas
const selectedArea = GMFoggyAreas.selectedArea
const selectedAction = GMFoggyAreas.selectedAction
const locked = computed(() => selectedArea.value?.id !== 0 && selectedAction.value !== 'EDIT')
const refreshPreview = () => GMFoggyAreas.renderMarkers()
const saveCreate = () => GMFoggyAreas.saveCreate()
const saveEdit = () => GMFoggyAreas.saveEdit()
const remove = () => GMFoggyAreas.deleteSelected()
const cancel = () => GMFoggyAreas.cancel()
</script>

<style scoped>
.fog-editor {
    display: grid;
    gap: 8px;
    margin-top: 12px;
}

.fog-editor label {
    display: flex;
    justify-content: space-between;
    gap: 12px;
}

.fog-editor input {
    width: 84px;
}

.fog-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
}

.danger {
    background-color: darkred;
    color: white;
}
</style>
