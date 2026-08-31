<template>
    <GameDialog v-if="dialogVisible" window-class="adaptive inventory-dialog-window npc-details-dialog-window" @close="closeDialog">
        <template #header>NPC details</template>

        <div class="npc-details-dialog-content">
            <div class="npc-details-row">
                <label class="npc-details-control">
                    <span>Name</span>
                    <input v-model="npcName" type="text" maxlength="32" placeholder="NPC name" />
                </label>

                <label class="npc-details-control">
                    <span>Wandering range</span>
                    <input v-model.number="wanderingRange" type="number" min="0" max="32" step="1" />
                </label>
            </div>

            <div class="npc-details-row">
                <label class="npc-details-control">
                    <span>Title</span>
                    <select v-model="titleSelection">
                        <option value="">No title</option>
                        <option v-for="title in presetTitles" :key="title" :value="title">{{ title }}</option>
                        <option value="__custom__">Custom title</option>
                    </select>
                </label>

                <label class="npc-details-control">
                    <span>Body type</span>
                    <select v-model="bodyType">
                        <option value="steve">Steve</option>
                    </select>
                </label>
            </div>

            <label v-if="titleSelection === '__custom__'" class="npc-details-control">
                <span>Custom title</span>
                <input v-model="customTitle" type="text" maxlength="48" placeholder="NPC title" />
            </label>

            <div class="npc-details-equipment">
                <label class="npc-details-control">
                    <span>Helm</span>
                    <select v-model="headSelection">
                        <option v-for="option in headOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </select>
                </label>

                <label class="npc-details-control">
                    <span>Arms</span>
                    <select v-model="armsSelection">
                        <option v-for="option in armsOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </select>
                </label>

                <label class="npc-details-control">
                    <span>Legs</span>
                    <select v-model="legsSelection">
                        <option v-for="option in legsOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </select>
                </label>

                <label class="npc-details-control">
                    <span>Body</span>
                    <select v-model="bodySelection">
                        <option v-for="option in bodyOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </select>
                </label>

                <label class="npc-details-control">
                    <span>Weapon</span>
                    <select v-model="weaponSelection">
                        <option v-for="option in weaponOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </select>
                </label>
            </div>

            <div class="npc-features-divider"></div>

            <div class="npc-feature-add">
                <span>Features</span>
                <select v-model="featureTypeToAdd">
                    <option value="">Add feature</option>
                    <option v-for="featureType in availableFeatureTypes" :key="featureType.value" :value="featureType.value">{{ featureType.label }}</option>
                </select>
                <button class="dialog-button" :disabled="!featureTypeToAdd" @click="addFeature">Add</button>
            </div>

            <div v-for="(feature, index) in features" :key="feature.type" class="npc-feature">
                <div class="npc-feature-heading">
                    <span>{{ featureLabels[feature.type] }}</span>
                    <button class="dialog-button" @click="removeFeature(index)">Remove</button>
                </div>

                <template v-if="feature.type === 'vendor'">
                    <div class="npc-feature-checkboxes">
                        <label v-for="category in vendorCategories" :key="category.value" class="npc-feature-checkbox" :class="{ 'npc-feature-checkbox-selected': feature.settings.itemCategories.includes(category.value) }">
                            <input v-model="feature.settings.itemCategories" type="checkbox" :value="category.value" />
                            <span>{{ category.label }}</span>
                        </label>
                    </div>

                    <div v-if="feature.settings.itemCategories.includes('weapons')" class="npc-vendor-materials">
                        <strong>Weapons</strong>
                        <div class="npc-feature-checkboxes npc-feature-material-checkboxes">
                            <label v-for="material in metalWeaponMaterials" :key="material.value" class="npc-feature-checkbox" :class="{ 'npc-feature-checkbox-selected': feature.settings.weaponMaterials.includes(material.value) }">
                                <input v-model="feature.settings.weaponMaterials" type="checkbox" :value="material.value" />
                                <span>{{ material.label }}</span>
                            </label>
                        </div>

                        <div class="npc-vendor-individual-items">
                            <div class="npc-vendor-item-add">
                                <select v-model="vendorItemSelections.weapons">
                                    <option :value="null">Add individual weapon</option>
                                    <option v-for="option in vendorIndividualItemOptions.weapons" :key="option.codebookId" :value="option.codebookId">{{ option.label }}</option>
                                </select>
                                <button class="dialog-button" :disabled="vendorItemSelections.weapons === null" @click="addVendorIndividualItem(feature, 'weapons')">Add</button>
                            </div>
                            <div v-if="feature.settings.individualItems.weapons.length" class="npc-vendor-item-list">
                                <button v-for="itemId in feature.settings.individualItems.weapons" :key="itemId" class="npc-vendor-item-chip" @click="removeVendorIndividualItem(feature, 'weapons', itemId)">{{ getVendorIndividualItemLabel('weapons', itemId) }} ×</button>
                            </div>
                        </div>
                    </div>

                    <div v-if="feature.settings.itemCategories.includes('bows')" class="npc-vendor-materials">
                        <strong>Bows</strong>
                        <div class="npc-feature-checkboxes npc-feature-material-checkboxes">
                            <label v-for="material in bowFeatureMaterials" :key="material.value" class="npc-feature-checkbox" :class="{ 'npc-feature-checkbox-selected': feature.settings.bowMaterials.includes(material.value) }">
                                <input v-model="feature.settings.bowMaterials" type="checkbox" :value="material.value" />
                                <span>{{ material.label }}</span>
                            </label>
                        </div>

                        <div class="npc-vendor-individual-items">
                            <div class="npc-vendor-item-add">
                                <select v-model="vendorItemSelections.bows">
                                    <option :value="null">Add individual bow</option>
                                    <option v-for="option in vendorIndividualItemOptions.bows" :key="option.codebookId" :value="option.codebookId">{{ option.label }}</option>
                                </select>
                                <button class="dialog-button" :disabled="vendorItemSelections.bows === null" @click="addVendorIndividualItem(feature, 'bows')">Add</button>
                            </div>
                            <div v-if="feature.settings.individualItems.bows.length" class="npc-vendor-item-list">
                                <button v-for="itemId in feature.settings.individualItems.bows" :key="itemId" class="npc-vendor-item-chip" @click="removeVendorIndividualItem(feature, 'bows', itemId)">{{ getVendorIndividualItemLabel('bows', itemId) }} ×</button>
                            </div>
                        </div>
                    </div>

                    <div v-if="feature.settings.itemCategories.includes('metalArmor')" class="npc-vendor-materials">
                        <strong>Metal armor</strong>
                        <div class="npc-vendor-individual-items">
                            <div class="npc-vendor-item-add">
                                <select v-model="vendorItemSelections.metalArmor">
                                    <option :value="null">Add individual metal armor</option>
                                    <option v-for="option in vendorIndividualItemOptions.metalArmor" :key="option.codebookId" :value="option.codebookId">{{ option.label }}</option>
                                </select>
                                <button class="dialog-button" :disabled="vendorItemSelections.metalArmor === null" @click="addVendorIndividualItem(feature, 'metalArmor')">Add</button>
                            </div>
                            <div v-if="feature.settings.individualItems.metalArmor.length" class="npc-vendor-item-list">
                                <button v-for="itemId in feature.settings.individualItems.metalArmor" :key="itemId" class="npc-vendor-item-chip" @click="removeVendorIndividualItem(feature, 'metalArmor', itemId)">{{ getVendorIndividualItemLabel('metalArmor', itemId) }} ×</button>
                            </div>
                        </div>
                    </div>

                    <div v-if="feature.settings.itemCategories.includes('leatherArmor')" class="npc-vendor-materials">
                        <strong>Leather armor</strong>
                        <div class="npc-vendor-individual-items">
                            <div class="npc-vendor-item-add">
                                <select v-model="vendorItemSelections.leatherArmor">
                                    <option :value="null">No leather armor available</option>
                                    <option v-for="option in vendorIndividualItemOptions.leatherArmor" :key="option.codebookId" :value="option.codebookId">{{ option.label }}</option>
                                </select>
                                <button class="dialog-button" :disabled="vendorItemSelections.leatherArmor === null" @click="addVendorIndividualItem(feature, 'leatherArmor')">Add</button>
                            </div>
                            <div v-if="feature.settings.individualItems.leatherArmor.length" class="npc-vendor-item-list">
                                <button v-for="itemId in feature.settings.individualItems.leatherArmor" :key="itemId" class="npc-vendor-item-chip" @click="removeVendorIndividualItem(feature, 'leatherArmor', itemId)">{{ getVendorIndividualItemLabel('leatherArmor', itemId) }} ×</button>
                            </div>
                        </div>
                    </div>

                    <div v-if="feature.settings.itemCategories.includes('resources')" class="npc-vendor-materials">
                        <strong>Resources</strong>
                        <div class="npc-vendor-individual-items">
                            <div class="npc-vendor-item-add">
                                <select v-model="vendorItemSelections.resources">
                                    <option :value="null">Add individual resource</option>
                                    <option v-for="option in vendorIndividualItemOptions.resources" :key="option.codebookId" :value="option.codebookId">{{ option.label }}</option>
                                </select>
                                <button class="dialog-button" :disabled="vendorItemSelections.resources === null" @click="addVendorIndividualItem(feature, 'resources')">Add</button>
                            </div>
                            <div v-if="feature.settings.individualItems.resources.length" class="npc-vendor-item-list">
                                <button v-for="itemId in feature.settings.individualItems.resources" :key="itemId" class="npc-vendor-item-chip" @click="removeVendorIndividualItem(feature, 'resources', itemId)">{{ getVendorIndividualItemLabel('resources', itemId) }} ×</button>
                            </div>
                        </div>
                    </div>
                </template>
            </div>

            <div class="dialog-actions">
                <button class="dialog-button" @click="saveDetails">Save</button>
                <button class="dialog-button npc-delete-button" @click="deleteDetails">Delete</button>
                <button class="dialog-button" @click="closeDialog">Cancel</button>
            </div>
        </div>
    </GameDialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { GMManager } from '@/gm/GM'
import GameDialog from '@/vue/views/GameDialog.vue'
import { EquipSlotModelsCb } from '@/data/items/item'

const presetTitles = ['Blacksmith', 'Jeweler', 'Bowcraft', 'Shopkeeper', 'Banker', 'Healer', 'Vendor', 'Skill Trainer', 'Common']
const npcTypeTitles = {
    banker: 'Banker',
    healer: 'Healer',
    skillTrainer: 'Skill Trainer',
    common: 'Common',
}
const featureTypes = [
    { value: 'vendor', label: 'Vendor' },
    { value: 'banker', label: 'Banker' },
    { value: 'healer', label: 'Healer' },
    { value: 'trainer', label: 'Trainer' },
]
const featureLabels = Object.fromEntries(featureTypes.map((featureType) => [featureType.value, featureType.label]))
const vendorCategories = [
    { value: 'weapons', label: 'Weapons' },
    { value: 'bows', label: 'Bows' },
    { value: 'metalArmor', label: 'Metal armor' },
    { value: 'leatherArmor', label: 'Leather armor' },
    { value: 'jewels', label: 'Jewels' },
    { value: 'resources', label: 'Resources' },
    { value: 'trinkets', label: 'Trinkets' },
]
const metalWeaponMaterials = [
    { value: 'steel', label: 'Steel' },
    { value: 'pyroxide', label: 'Pyroxide' },
    { value: 'geonite', label: 'Geonite' },
    { value: 'mythril', label: 'Mythril' },
    { value: 'chaotite', label: 'Chaotite' },
]
const bowFeatureMaterials = [
    { value: 'wooden', label: 'Wooden' },
    { value: 'cherrywood', label: 'Cherrywood' },
    { value: 'mahogany', label: 'Mahogany' },
    { value: 'elven', label: 'Elven' },
    { value: 'ethereal', label: 'Ethereal' },
]
const optionValue = (modelId, materialId) => `${modelId}:${materialId}`
const armorOptions = (label, modelId, codebookId) => [
    { label: 'None', value: '' },
    { label, value: optionValue(modelId, 1), codebookId },
]
const headOptions = armorOptions('Steel helmet', EquipSlotModelsCb.HELM.modelId, 3)
const armsOptions = armorOptions('Steel plate pauldrons', EquipSlotModelsCb.PAULDRONS_PLATE.modelId, 2)
const legsOptions = armorOptions('Steel plate greaves', EquipSlotModelsCb.LEGS_PLATE.modelId, 1)
const bodyOptions = armorOptions('Steel plate armor', EquipSlotModelsCb.ARMOR_PLATE.modelId, 6)
const weaponNames = {
    LONGSWORD: 'Longsword', BROADSWORD: 'Broadsword', GREATSWORD: 'Greatsword',
    HAND_AXE: 'Hand axe', BATTLE_AXE: 'Battle axe', GREATAXE: 'Great axe', PICKAXE: 'Pickaxe',
    LIGHT_MACE: 'Light mace', FLANGED_MACE: 'Flanged mace', WARHAMMER: 'Warhammer',
    HUNTING_SPEAR: 'Hunting spear', WAR_SPEAR: 'War spear', HALBERD: 'Halberd',
    KNIFE: 'Knife', STILETTO: 'Stiletto', RONDEL: 'Rondel',
    HUNTINGBOW: 'Hunting bow', RECURVE_BOW: 'Recurve bow', LONGBOW: 'Longbow',
}
const metalMaterials = [[1, 'Steel'], [2, 'Pyroxide'], [3, 'Geonite'], [4, 'Mythril'], [5, 'Chaotite']]
const bowMaterials = [[1, 'Wooden'], [2, 'Cherrywood'], [3, 'Mahogany'], [4, 'Elven'], [5, 'Ethereal']]
const pickaxeMaterials = [[1, 'Steel'], [6, 'Diamond'], [2, 'Pyroxide'], [3, 'Geonite'], [4, 'Mythril'], [5, 'Chaotite']]
const weaponCodebookBaseIds = {
    LONGSWORD: 100, BROADSWORD: 110, GREATSWORD: 120,
    HAND_AXE: 200, BATTLE_AXE: 210, GREATAXE: 220,
    LIGHT_MACE: 300, FLANGED_MACE: 310, WARHAMMER: 320,
    HUNTING_SPEAR: 400, WAR_SPEAR: 410, HALBERD: 420,
    KNIFE: 500, STILETTO: 510, RONDEL: 520,
    HUNTINGBOW: 600, RECURVE_BOW: 610, LONGBOW: 620,
}
const pickaxeCodebookIds = { 1: 3, 2: 5, 3: 6, 4: 7, 5: 8, 6: 4 }
const resourceOptions = [
    { codebookId: 1, label: 'Bandages' },
    { codebookId: 101, label: 'Iron ore' },
    { codebookId: 201, label: 'Wooden log' },
    { codebookId: 301, label: 'Common meat' },
    { codebookId: 351, label: 'Steak' },
    { codebookId: 1001, label: 'Small healing potion' },
    { codebookId: 1002, label: 'Healing potion' },
    { codebookId: 1003, label: 'Great healing potion' },
    { codebookId: 1011, label: 'Small mana potion' },
    { codebookId: 1012, label: 'Mana potion' },
    { codebookId: 1013, label: 'Great mana potion' },
]
const weaponOptions = [
    { label: 'None', value: '' },
    ...Object.entries(weaponNames).flatMap(([key, name]) => {
        const modelId = EquipSlotModelsCb[key].modelId
        const materials = key === 'PICKAXE' ? pickaxeMaterials : key.endsWith('BOW') ? bowMaterials : metalMaterials
        return materials.map(([materialId, material]) => ({
            label: `${material} ${name}`,
            value: optionValue(modelId, materialId),
            codebookId: key === 'PICKAXE' ? pickaxeCodebookIds[materialId] : weaponCodebookBaseIds[key] + materialId - 1,
            isBow: key.endsWith('BOW'),
        }))
    }),
]
const vendorIndividualItemOptions = {
    weapons: weaponOptions.filter((option) => option.codebookId && !option.isBow),
    bows: weaponOptions.filter((option) => option.codebookId && option.isBow),
    metalArmor: [...headOptions, ...armsOptions, ...legsOptions, ...bodyOptions].filter((option) => option.codebookId),
    leatherArmor: [],
    resources: resourceOptions,
}
const dialogVisible = ref(false)
const npcName = ref('')
const wanderingRange = ref(0)
const titleSelection = ref('')
const customTitle = ref('')
const bodyType = ref('steve')
const headSelection = ref('')
const armsSelection = ref('')
const legsSelection = ref('')
const bodySelection = ref('')
const weaponSelection = ref('')
const features = ref([])
const featureTypeToAdd = ref('')
const vendorItemSelections = ref({weapons: null, bows: null, metalArmor: null, leatherArmor: null, resources: null})
const availableFeatureTypes = computed(() => featureTypes.filter((featureType) => !features.value.some((feature) => feature.type === featureType.value)))

const selectionFromItem = (item) => item ? optionValue(item.modelId, item.materialId) : ''
const itemFromSelection = (selection) => {
    if (!selection) {
        return undefined
    }
    const [modelId, materialId] = selection.split(':').map(Number)
    return { modelId, materialId }
}

const createFeature = (type) => ({
    type,
    settings: type === 'vendor'
        ? { itemCategories: [], weaponMaterials: [], bowMaterials: [], individualItems: {weapons: [], bows: [], metalArmor: [], leatherArmor: [], resources: []} }
        : {},
})

const addFeature = () => {
    if (!featureTypeToAdd.value) {
        return
    }
    features.value.push(createFeature(featureTypeToAdd.value))
    featureTypeToAdd.value = ''
}

const removeFeature = (index) => {
    features.value.splice(index, 1)
}

const addVendorIndividualItem = (feature, category) => {
    const itemId = vendorItemSelections.value[category]
    if (!Number.isInteger(itemId) || feature.settings.individualItems[category].includes(itemId)) {
        return
    }
    feature.settings.individualItems[category].push(itemId)
    vendorItemSelections.value[category] = null
}

const removeVendorIndividualItem = (feature, category, itemId) => {
    feature.settings.individualItems[category] = feature.settings.individualItems[category].filter((id) => id !== itemId)
}

const getVendorIndividualItemLabel = (category, itemId) => vendorIndividualItemOptions[category].find((option) => option.codebookId === itemId)?.label ?? `Item #${itemId}`

const openDialog = () => {
    const npc = GMManager.selectedNpc.value
    if (!npc) {
        return
    }
    const title = npc?.title ?? ''
    if (presetTitles.includes(title)) {
        titleSelection.value = title
        customTitle.value = ''
    } else if (title === '') {
        titleSelection.value = featureLabels[npc?.features?.[0]?.type] ?? npcTypeTitles[npc?.type] ?? ''
        customTitle.value = ''
    } else {
        titleSelection.value = '__custom__'
        customTitle.value = title
    }
    npcName.value = npc.name ?? ''
    wanderingRange.value = npc.wanderingRange ?? 0
    bodyType.value = npc?.bodyType ?? 'steve'
    headSelection.value = selectionFromItem(npc?.equipment?.head)
    armsSelection.value = selectionFromItem(npc?.equipment?.arms)
    legsSelection.value = selectionFromItem(npc?.equipment?.legs)
    bodySelection.value = selectionFromItem(npc?.equipment?.body)
    weaponSelection.value = selectionFromItem(npc?.equipment?.weapon)
    features.value = (npc?.features ?? []).map((feature) => ({
        type: feature.type,
        settings: feature.type === 'vendor'
            ? {
                itemCategories: [...(feature.settings?.itemCategories ?? [])],
                weaponMaterials: [...(feature.settings?.weaponMaterials ?? [])],
                bowMaterials: [...(feature.settings?.bowMaterials ?? [])],
                individualItems: {
                    weapons: [...(feature.settings?.individualItems?.weapons ?? [])],
                    bows: [...(feature.settings?.individualItems?.bows ?? [])],
                    metalArmor: [...(feature.settings?.individualItems?.metalArmor ?? [])],
                    leatherArmor: [...(feature.settings?.individualItems?.leatherArmor ?? [])],
                    resources: [...(feature.settings?.individualItems?.resources ?? [])],
                },
            }
            : {},
    }))
    featureTypeToAdd.value = ''
    dialogVisible.value = true
}

const closeDialog = () => {
    dialogVisible.value = false
}

const saveDetails = () => {
    const title = titleSelection.value === '__custom__' ? customTitle.value.trim() : titleSelection.value
    GMManager.setSelectedNpcDetails(npcName.value, title, bodyType.value, {
        head: itemFromSelection(headSelection.value),
        arms: itemFromSelection(armsSelection.value),
        legs: itemFromSelection(legsSelection.value),
        body: itemFromSelection(bodySelection.value),
        weapon: itemFromSelection(weaponSelection.value),
    }, features.value, wanderingRange.value)
    GMManager.saveSelectedNpc()
    closeDialog()
}

const deleteDetails = () => {
    if (!window.confirm(`Delete NPC "${npcName.value}"?`)) {
        return
    }
    GMManager.deleteSelectedNpc()
    closeDialog()
}

defineExpose({
    openDialog,
})
</script>

<style scoped>
.npc-details-dialog-content {
    width: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
}

.npc-details-control {
    display: grid;
    grid-template-columns: 86px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    font-size: 12px;
}

.npc-details-row,
.npc-details-equipment {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.npc-details-control input,
.npc-details-control select {
    width: 100%;
    box-sizing: border-box;
}

.npc-features-divider {
    border-top: 1px solid rgba(176, 143, 86, 0.5);
    margin: 4px 0;
}

.npc-feature-add {
    display: grid;
    grid-template-columns: 86px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    font-size: 12px;
}

.npc-feature-add select {
    width: 100%;
    box-sizing: border-box;
}

.npc-feature {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 8px;
    border: 1px solid rgba(176, 143, 86, 0.35);
}

.npc-feature-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 14px;
}

.npc-feature-heading > span {
    font-weight: 700;
}

.npc-feature-checkboxes {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 5px 10px;
}

.npc-feature-checkbox {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: rgb(var(--ui-dark));
}

.npc-vendor-materials {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding-top: 3px;
    font-size: 12px;
}

.npc-vendor-individual-items {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.npc-vendor-item-add {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
}

.npc-vendor-item-add select {
    width: 100%;
    min-width: 0;
}

.npc-vendor-item-list {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
}

.npc-vendor-item-chip {
    padding: 3px 6px;
    border: 1px solid rgb(var(--ui-darker));
    background: rgba(0, 0, 0, 0.2);
    color: rgb(var(--ui-base));
    font-size: 11px;
    cursor: pointer;
}

.npc-feature-checkbox.npc-feature-checkbox-selected {
    color: rgb(var(--ui-base));
}

.npc-delete-button {
    color: #b84848;
}
</style>
