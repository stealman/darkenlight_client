<template>
    <div>
        <template v-if="selectedNpc">
            <label>Selected NPC #{{ selectedNpc.id }}</label>

            <label style="display: block; margin-top: 1vh;">NPC name</label>
            <input v-model="selectedNpc.name" maxlength="32" placeholder="NPC name" />

            <label style="display: block; margin-top: 1vh;">Type</label>
            <select v-model="selectedNpc.type">
                <option value="common">Common</option>
                <option value="banker">Banker</option>
                <option value="vendor">Vendor</option>
                <option value="healer">Healer</option>
                <option value="skillTrainer">Skill Trainer</option>
            </select>

            <label style="display: block; margin-top: 1vh;">Wandering range</label>
            <input v-model.number="selectedNpc.wanderingRange" type="number" min="0" max="32" step="1" />

            <div style="margin-top: 2vh;">
                <button style="background-color: lightblue; color: black" @click="saveSelectedNpc">Save</button>
                &nbsp;
                <button style="background-color: darkred; color: white" @click="deleteSelectedNpc">Delete</button>
                &nbsp;
                <button @click="cancelSelectedNpc">Cancel</button>
            </div>
        </template>

        <template v-else>
            <label>NPC name</label>
            <input v-model="selectedNpcName" maxlength="32" placeholder="NPC name" />

            <label style="display: block; margin-top: 1vh;">Type</label>
            <select v-model="selectedNpcType">
                <option value="common">Common</option>
                <option value="banker">Banker</option>
                <option value="vendor">Vendor</option>
                <option value="healer">Healer</option>
                <option value="skillTrainer">Skill Trainer</option>
            </select>

            <label style="display: block; margin-top: 1vh;">Wandering range</label>
            <input v-model.number="selectedNpcWanderingRange" type="number" min="0" max="32" step="1" />

            <p style="color: lightblue; font-size: 0.8rem;">Choose a name, type and wandering range, then click a free tile to place the NPC. Click an existing NPC to edit it.</p>
        </template>
    </div>
</template>

<script setup>
import { GMManager } from '@/gm/GM'

const selectedNpcName = GMManager.selectedNpcName
const selectedNpcType = GMManager.selectedNpcType
const selectedNpcWanderingRange = GMManager.selectedNpcWanderingRange
const selectedNpc = GMManager.selectedNpc

const saveSelectedNpc = () => {
    GMManager.saveSelectedNpc()
}

const deleteSelectedNpc = () => {
    GMManager.deleteSelectedNpc()
}

const cancelSelectedNpc = () => {
    selectedNpc.value = null
}
</script>
