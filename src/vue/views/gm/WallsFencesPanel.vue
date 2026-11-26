<template>
    <div v-if="editingStatic" style="margin-bottom: 1vh; display: flex; align-items: center; gap: 8px">
        <span v-if="multipleWalls">Počet vybraných zdí: {{ selectedStoneWallTiles.length }}</span>
        <template v-else>
            <span>Tile {{ editingStatic.position.x }}, {{ editingStatic.position.z }}</span>
            <button @click="GMManager.deleteSelectedStatic()">Delete</button>
        </template>
    </div>
    <div>
        <label class="tree-item" :class="{ selected: selectedObject === 0 }" @click="selectNone()">
            None
        </label>
    </div>

    <!-- WALLS AND FENCES -->
    <div style="margin-top: 1vh">
        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'WALL2' === selectedObjectType }" @click="selectObjectType('WALL2')">Wall 2</label>
            &nbsp;&nbsp;
            <select v-if="selectedObjectType === 'WALL2'" :disabled="editingStatic" @change="selectObject($event.target.value)">
                <option v-for="obj in objects.filter(s => s.type ==='WALL2')" :key="obj.id" :value="obj.id" :selected="obj.id === selectedObject">
                    {{ obj.name }}
                </option>
            </select>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'WALL3' === selectedObjectType }" @click="selectObjectType('WALL3')">Wall 3</label>
            &nbsp;&nbsp;
            <select v-if="selectedObjectType === 'WALL3'" :disabled="editingStatic" @change="selectObject($event.target.value)">
                <option v-for="obj in objects.filter(s => s.type ==='WALL3')" :key="obj.id" :value="obj.id" :selected="obj.id === selectedObject">
                    {{ obj.name }}
                </option>
            </select>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'PALISADE' === selectedObjectType }" @click="selectObjectType('PALISADE')">Palisade</label>
            <label v-if="selectedObjectType === 'PALISADE'">
                &nbsp;&nbsp;dir.
                <select v-model="palisadeOrientation">
                    <option value="X">X</option>
                    <option value="Z">Z</option>
                </select>
            </label>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'PALISADE_SMALL' === selectedObjectType }" @click="selectObjectType('PALISADE_SMALL')">Palisade-S</label>
            <label v-if="selectedObjectType === 'PALISADE_SMALL'">
                &nbsp;&nbsp;dir.
                <select v-model="palisadeOrientation">
                    <option value="X">X</option>
                    <option value="Z">Z</option>
                </select>
            </label>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'PALISADE_SPIKED' === selectedObjectType }" @click="selectObjectType('PALISADE_SPIKED')">Palisade-Spiked</label>
            <label v-if="selectedObjectType === 'PALISADE_SPIKED'">
                &nbsp;&nbsp;dir.
                <select v-model="spikedPalisadeFacing">
                    <option value="-X">-X</option>
                    <option value="+X">+X</option>
                    <option value="-Z">-Z</option>
                    <option value="+Z">+Z</option>
                </select>
            </label>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'CAMP_FENCE' === selectedObjectType }" @click="selectObjectType('CAMP_FENCE')">Camp Fence</label>
            <label v-if="selectedObjectType === 'CAMP_FENCE'">
                &nbsp;&nbsp;dir.
                <select v-model="palisadeOrientation">
                    <option value="X">X</option>
                    <option value="Z">Z</option>
                </select>
            </label>
            <label v-if="selectedObjectType === 'CAMP_FENCE'">
                <input v-model="campFenceDamaged" type="checkbox">
                Poškozené prkno
            </label>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'CEMETERY_FENCE' === selectedObjectType }" @click="selectObjectType('CEMETERY_FENCE')">Cemetery Iron Fence</label>
            <label v-if="selectedObjectType === 'CEMETERY_FENCE'">
                &nbsp;&nbsp;dir.
                <select v-model="palisadeOrientation">
                    <option value="X">X</option>
                    <option value="Z">Z</option>
                </select>
            </label>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'STONE_WALL' === selectedObjectType }" @click="selectObjectType('STONE_WALL')">Stone Wall</label>
            <div v-if="multipleWalls && wallBounds" class="stone-wall-attributes">
                <div class="stone-wall-range-row">
                    <span>Orientace</span>
                    <select v-model="wallBounds.orientation" aria-label="Orientace">
                        <option value="–">–</option>
                        <option value="X">X</option>
                        <option value="Z">Z</option>
                    </select>
                </div>
                <div class="stone-wall-range-row">
                    <span></span>
                    <span>Od</span>
                    <span>Do</span>
                </div>
                <div v-for="(label, attribute) in attributeLabels" :key="attribute" class="stone-wall-range-row">
                    <span>{{ label }}</span>
                    <select v-model="wallBounds.ranges[attribute].min" :aria-label="`${label} od`">
                        <option v-for="value in stoneWallAttributeValues[attribute]" :key="value" :value="value">{{ value }}</option>
                    </select>
                    <select v-model="wallBounds.ranges[attribute].max" :aria-label="`${label} do`">
                        <option v-for="value in stoneWallAttributeValues[attribute]" :key="value" :value="value">{{ value }}</option>
                    </select>
                </div>
                <div class="stone-wall-actions">
                    <button :disabled="!canApplyBounds" @click="GMManager.applyStoneWallBounds(wallBounds, 'randomize')">Randomize</button>
                    <button :disabled="!canApplyBounds" @click="GMManager.applyStoneWallBounds(wallBounds, 'keepRatio')">Keep Ratio</button>
                </div>
                <span v-if="!validStoneWallBounds(wallBounds)" role="status">Hodnota Od musí být menší nebo rovna hodnotě Do.</span>
            </div>
            <div v-else-if="!multipleWalls && selectedObjectType === 'STONE_WALL'" class="stone-wall-attributes">
                <label>
                    Orientace
                    <select v-model="palisadeOrientation">
                        <option value="X">X</option>
                        <option value="Z">Z</option>
                    </select>
                </label>
                <label>
                    Přesnost
                    <select v-model.number="stoneWallPrecision">
                        <option v-for="value in stoneWallAttributeValues.precision" :key="value" :value="value">{{ value }}</option>
                    </select>
                </label>
                <label>
                    Poškození
                    <select v-model.number="stoneWallDamage">
                        <option v-for="value in stoneWallAttributeValues.damage" :key="value" :value="value">{{ value }}</option>
                    </select>
                </label>
                <label>
                    Výška
                    <select v-model.number="stoneWallHeight">
                        <option v-for="value in stoneWallAttributeValues.height" :key="value" :value="value">{{ value }}</option>
                    </select>
                </label>
                <label>
                    Šířka
                    <select v-model.number="stoneWallWidth">
                        <option v-for="value in stoneWallAttributeValues.width" :key="value" :value="value">{{ value.toFixed(1) }}</option>
                    </select>
                </label>
            </div>
        </div>

        <div style="margin-top: 1vh">
            <label class="tree-item" :class="{ selected: 'WALKABLE_BLOCK' === selectedObjectType }" @click="selectObjectType('WALKABLE_BLOCK')">Walkable Block</label>
            <label v-if="selectedObjectType === 'WALKABLE_BLOCK'">
                &nbsp;&nbsp;height
                <select v-model.number="walkableBlockHeight">
                    <option :value="0.5">0.5</option>
                    <option :value="1">1</option>
                </select>
                &nbsp;&nbsp;material
                <select v-model="walkableBlockMaterial">
                    <option value="WOOD">Wood</option>
                    <option value="STONE_GRAY">Stone Gray</option>
                    <option value="STONE_RED">Stone Red</option>
                </select>
            </label>
        </div>
    </div>
</template>

<script setup>

import { GMManager, selectedStoneWallAttributes, stoneWallAttributeValues, validStoneWallBounds } from '@/gm/GM'
import { computed, ref, watch } from 'vue'

const selectedObjectType = ref("")
const selectedObject = GMManager.selectedWallFence
const palisadeOrientation = GMManager.palisadeOrientation
const campFenceDamaged = GMManager.campFenceDamaged
const stoneWallPrecision = GMManager.stoneWallPrecision
const stoneWallDamage = GMManager.stoneWallDamage
const stoneWallHeight = GMManager.stoneWallHeight
const stoneWallWidth = GMManager.stoneWallWidth
const spikedPalisadeFacing = GMManager.spikedPalisadeFacing
const walkableBlockHeight = GMManager.walkableBlockHeight
const walkableBlockMaterial = GMManager.walkableBlockMaterial
const editingStatic = GMManager.editingStatic
const selectedStoneWallTiles = GMManager.selectedStoneWallTiles
const multipleWalls = computed(() => selectedStoneWallTiles.value.length > 1)
const attributeLabels = {precision: 'Přesnost', damage: 'Poškození', height: 'Výška', width: 'Šířka'}
const wallBounds = ref(null)
const canApplyBounds = computed(() => !!selectedStoneWallAttributes.value && !!wallBounds.value && validStoneWallBounds(wallBounds.value))

watch(selectedStoneWallTiles, () => {
    wallBounds.value = structuredClone(selectedStoneWallAttributes.value)
}, {immediate: true})

const objects = [
    { type: "WALL2", name: "Wall2_GRAY", id: 201 },
    { type: "WALL2", name: "Wall2_RED", id: 202 },
    { type: "PALISADE", name: "PalisadeWall2", id: 203 },
    { type: "PALISADE_SMALL", name: "PalisadeSmall", id: 204 },
    { type: "PALISADE_SPIKED", name: "PalisadeSpiked", id: 205 },
    { type: "WALKABLE_BLOCK", name: "WalkableBlock", id: 206 },
    { type: "CAMP_FENCE", name: "CampFence", id: 207 },
    { type: "CEMETERY_FENCE", name: "CemeteryIronFence", id: 208 },
    { type: "STONE_WALL", name: "StoneWall", id: 210 },

    { type: "WALL3", name: "Wall3_GRAY", id: 221 },
    { type: "WALL3", name: "Wall3_RED", id: 222 },
]

const selectObjectType = (type) => {
    GMManager.clearStaticSelection()
    selectedObjectType.value = type

    const firstObject = objects.find(s => s.type === type)
    if (firstObject) {
        selectedObject.value = firstObject.id
    }
}

const selectObject = (id) => {
    if (editingStatic.value) return
    selectedObject.value = parseInt(id)
}

const selectNone = () => {
    GMManager.clearStaticSelection()
    selectedObject.value = 0
    selectedObjectType.value = ""
}

watch(selectedObject, (id) => {
    selectedObjectType.value = objects.find((obj) => obj.id === id)?.type ?? ""
})
</script>

<style scoped>
.stone-wall-attributes {
    display: grid;
    gap: 6px;
    margin-top: 6px;
}

.stone-wall-attributes label {
    display: grid;
    grid-template-columns: 1fr 4rem;
    align-items: center;
    gap: 8px;
}

.stone-wall-range-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) repeat(2, 3rem);
    align-items: center;
    gap: 6px;
}

.stone-wall-range-row select {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    text-align: center;
}

.stone-wall-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
</style>
