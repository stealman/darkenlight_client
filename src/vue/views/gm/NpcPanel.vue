<template>
    <div>
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

        <p style="color: lightblue; font-size: 0.8rem;">Choose a name and type, then click a free tile in the world to place the NPC.</p>
    </div>
</template>

<script setup>
import { GMManager } from '@/gm/GM'

const selectedNpcName = GMManager.selectedNpcName
const selectedNpcType = GMManager.selectedNpcType
</script>
