<template>
    <GameDialog
        v-if="dialogVisible"
        backdrop-class="inventory-dialog-backdrop"
        window-class="adaptive inventory-dialog-window npc-use-dialog-window"
        :close-on-backdrop="false"
        @backdrop-click="onBackdropClick"
        @close="closeDialog"
    >
        <template #header>
            <div class="npc-use-header">
                <div class="npc-use-feature-tabs">
                    <div
                        v-for="(feature, index) in features"
                        :key="feature.type"
                        class="tab-item"
                        :class="{ active: selectedFeatureIndex === index }"
                        @click="selectFeature(index)"
                    >
                        <label :class="['noselect', { 'ui-text-gradient': selectedFeatureIndex === index, 'ui-text-gradient--no-shadow': selectedFeatureIndex === index }]">{{ getFeatureLabel(feature.type) }}</label>
                    </div>
                </div>
                <div class="npc-use-emeralds">
                    <img src="/images/icons/emerald.png" alt="Emerald" />
                    <span class="ui-emerald-text-gradient">{{ formattedEmeralds }}</span>
                </div>
            </div>
        </template>

        <div class="npc-use-content-shell" @click="hideItemOverlays">
            <template v-if="selectedFeature?.type === 'vendor' || selectedFeature?.type === 'healer'">
                <div v-if="selectedFeature?.type === 'vendor' && vendorCategories.length" class="npc-use-category-tabs">
                    <button
                        v-for="category in vendorCategories"
                        :key="category.key"
                        class="dialog-button npc-use-tab"
                        :class="{ selected: selectedCategory === category.key }"
                        @click="selectCategory(category.key)"
                    >
                        <span class="ui-text-gradient--button-state">
                            {{ getCategoryLabel(category.key) }}
                        </span>
                    </button>
                </div>

                <div v-if="selectedCategoryItems.length || selectedFeature?.services?.length" :class="['npc-vendor-item-list', { 'npc-vendor-catalog-list': selectedFeature?.type === 'vendor', 'npc-healer-service-list': selectedFeature?.type === 'healer' }]">
                    <div
                        v-for="item in selectedCategoryItems"
                        :key="`${item.tp}:${item.cb}`"
                        class="npc-vendor-item-row"
                        role="button"
                        tabindex="0"
                        @click.stop="showItemDetails(item, $event)"
                        @keydown.enter="showItemDetails(item, $event)"
                        >
                        <img :class="['npc-vendor-item-icon', { 'npc-vendor-item-icon--tooltip-active': detailItem?.tp === item.tp && detailItem?.cb === item.cb }]" :src="getItemImage(item)" :alt="getItemName(item)" />
                        <span class="npc-vendor-item-name">
                            <span class="ui-text-gradient">{{ getItemName(item) }}</span>
                            <span v-if="item.tp === 'R'" class="npc-vendor-item-owned">({{ getOwnedResourceCount(item) }})</span>
                        </span>
                        <span class="npc-vendor-item-price">
                            <span class="ui-emerald-text-gradient">{{ getTotalPrice(item) }}</span>
                            <img src="/images/icons/emerald.png" alt="Emerald" />
                        </span>
                        <div class="npc-vendor-buy-actions">
                            <button class="dialog-button npc-vendor-buy-button npc-vendor-purchase-button" @click.stop="buyItem(item, 1, $event)">
                                <span class="ui-text-gradient--button-state">{{ item.tp === 'R' ? '×1' : t('vendor.buy') }}</span>
                            </button>
                            <template v-if="item.tp === 'R'">
                                <button class="dialog-button npc-vendor-quick-buy-button" @click.stop="buyItem(item, 5, $event)"><span class="ui-text-gradient--button-state">×5</span></button>
                                <button class="dialog-button npc-vendor-quick-buy-button" @click.stop="buyItem(item, 25, $event)"><span class="ui-text-gradient--button-state">×25</span></button>
                            </template>
                        </div>
                    </div>
                    <button
                        v-for="service in (selectedFeature?.services ?? []).filter((service) => service.price > 0)"
                        :key="service.id"
                        class="npc-vendor-item-row npc-healer-service-row"
                        :disabled="service.price < 1"
                        @click.stop="buyHealerService(service, $event)"
                    >
                        <img class="npc-vendor-item-icon" :src="getServiceImage(service)" :alt="service.name" />
                        <span class="npc-vendor-item-name">{{ service.name }}</span>
                        <span class="npc-vendor-item-price">
                            <span class="ui-emerald-text-gradient">{{ service.price }}</span>
                            <img src="/images/icons/emerald.png" alt="Emerald" />
                        </span>
                    </button>
                </div>
                <div v-else class="npc-use-empty-state">{{ t('vendor.emptyCategory') }}</div>
            </template>

            <template v-else-if="selectedFeature?.type === 'banker'">
                <BankPanel v-if="npcData && !bankLoading" :npc-id="npcData.id" />
                <div v-else class="npc-use-empty-state">{{ t('vendor.bankLoading') }}</div>
            </template>

            <template v-else-if="selectedFeature?.type === 'repairer'">
                <div v-if="repairItems.equipment.length || repairItems.inventory.length" class="npc-vendor-item-list npc-repairer-item-list">
                    <template v-if="repairItems.equipment.length">
                        <h3 class="npc-repairer-section-title"><span class="ui-text-gradient">{{ t('vendor.equipment') }}</span></h3>
                        <div
                            v-for="repairItem in repairItems.equipment"
                            :key="repairItem.item.id"
                            class="npc-vendor-item-row npc-repairer-item-row"
                            role="button"
                            tabindex="0"
                            @click.stop="showRepairItemDetails(repairItem.item, $event)"
                            @keydown.enter="showRepairItemDetails(repairItem.item, $event)"
                        >
                            <div :class="['npc-repairer-item-icon', repairItem.durabilityStatus ? `item-durability--${repairItem.durabilityStatus}` : null]">
                                <img :class="['npc-vendor-item-icon', { 'npc-vendor-item-icon--tooltip-active': repairItemInfoOverlay.visible && repairItemInfoOverlay.sourceItemId === repairItem.item.id }]" :src="getRepairItemImage(repairItem.item)" :alt="repairItem.item.name ?? ''" />
                            </div>
                            <span class="npc-vendor-item-name"><span class="ui-text-gradient">{{ repairItem.item.name }}</span></span>
                            <span :class="['npc-repairer-durability', repairItem.durabilityStatus ? `item-durability--${repairItem.durabilityStatus}` : null]">
                                <span class="npc-repairer-durability-value">{{ getItemDurability(repairItem.item) }} / {{ getItemMaxDurability(repairItem.item) }}</span>
                                <span class="npc-repairer-durability-track">
                                    <span :class="['npc-repairer-durability-fill', 'ui-progress-fill-gradient', repairItem.durabilityStatus ? `item-durability--${repairItem.durabilityStatus}` : null]" :style="{ width: `${getRepairDurabilityPercent(repairItem.item)}%` }"></span>
                                </span>
                            </span>
                            <span class="npc-vendor-item-price">
                                <span class="ui-emerald-text-gradient">{{ repairItem.price }}</span>
                                <img src="/images/icons/emerald.png" alt="Emerald" />
                            </span>
                            <button class="dialog-button npc-vendor-buy-button npc-vendor-purchase-button" @click.stop="repairSelectedItem(repairItem, $event)">
                                <span class="ui-text-gradient--button-state">{{ t('vendor.repair') }}</span>
                            </button>
                        </div>
                    </template>
                    <template v-if="repairItems.inventory.length">
                        <h3 class="npc-repairer-section-title"><span class="ui-text-gradient">{{ t('vendor.inventory') }}</span></h3>
                        <div
                            v-for="repairItem in repairItems.inventory"
                            :key="repairItem.item.id"
                            class="npc-vendor-item-row npc-repairer-item-row"
                            role="button"
                            tabindex="0"
                            @click.stop="showRepairItemDetails(repairItem.item, $event)"
                            @keydown.enter="showRepairItemDetails(repairItem.item, $event)"
                        >
                        <div :class="['npc-repairer-item-icon', repairItem.durabilityStatus ? `item-durability--${repairItem.durabilityStatus}` : null]">
                            <img :class="['npc-vendor-item-icon', { 'npc-vendor-item-icon--tooltip-active': repairItemInfoOverlay.visible && repairItemInfoOverlay.sourceItemId === repairItem.item.id }]" :src="getRepairItemImage(repairItem.item)" :alt="repairItem.item.name ?? ''" />
                        </div>
                        <span class="npc-vendor-item-name"><span class="ui-text-gradient">{{ repairItem.item.name }}</span></span>
                        <span :class="['npc-repairer-durability', repairItem.durabilityStatus ? `item-durability--${repairItem.durabilityStatus}` : null]">
                            <span class="npc-repairer-durability-value">{{ getItemDurability(repairItem.item) }} / {{ getItemMaxDurability(repairItem.item) }}</span>
                            <span class="npc-repairer-durability-track">
                                <span :class="['npc-repairer-durability-fill', 'ui-progress-fill-gradient', repairItem.durabilityStatus ? `item-durability--${repairItem.durabilityStatus}` : null]" :style="{ width: `${getRepairDurabilityPercent(repairItem.item)}%` }"></span>
                            </span>
                        </span>
                        <span class="npc-vendor-item-price">
                            <span class="ui-emerald-text-gradient">{{ repairItem.price }}</span>
                            <img src="/images/icons/emerald.png" alt="Emerald" />
                        </span>
                        <button class="dialog-button npc-vendor-buy-button npc-vendor-purchase-button" @click.stop="repairSelectedItem(repairItem, $event)">
                            <span class="ui-text-gradient--button-state">{{ t('vendor.repair') }}</span>
                        </button>
                        </div>
                    </template>
                </div>
                <div v-else class="npc-use-empty-state">{{ t('vendor.noRepairableItems') }}</div>
            </template>

            <template v-else-if="selectedFeature?.type === 'trainer'">
                <div class="npc-use-category-tabs">
                    <button
                        v-for="tab in trainerTabs"
                        :key="tab"
                        class="dialog-button npc-use-tab"
                        :class="{ selected: selectedTrainerTab === tab }"
                        :disabled="tab === 'newSkills' && trainerNewSkills.length === 0"
                        @click="selectedTrainerTab = tab"
                    >
                        <span class="ui-text-gradient--button-state">
                            {{ t(`vendor.${tab}`) }}
                        </span>
                    </button>
                </div>
                <div
                    v-if="selectedTrainerTab === 'newSkills'"
                    class="npc-trainer-skill-list"
                >
                    <section v-for="category in trainerNewSkillCategories" :key="category.key" class="npc-trainer-skill-category">
                        <h3 class="npc-trainer-skill-category-title">{{ t(`skills.categories.${category.key}`) }}</h3>
                        <div class="npc-trainer-skill-category-list">
                            <div v-for="skill in category.skills" :key="skill.key" class="npc-trainer-skill-row">
                                <span class="npc-trainer-skill-name">{{ t(skill.translationKey) }}</span>
                                <span class="npc-trainer-skill-description">{{ t(skill.descriptionTranslationKey) }}</span>
                                <span class="npc-vendor-item-price">
                                    <span class="ui-emerald-text-gradient">{{ trainerSkillLearningPrice }}</span>
                                    <img src="/images/icons/emerald.png" alt="Emerald" />
                                </span>
                                <button class="dialog-button npc-vendor-buy-button" @click.stop="learnSkill(skill.key, $event)">{{ t('vendor.learnSkill') }}</button>
                            </div>
                        </div>
                    </section>
                    <div v-if="trainerNewSkills.length === 0" class="npc-use-empty-state">{{ t('vendor.noNewSkills') }}</div>
                </div>
                <div v-else-if="selectedTrainerTab === 'promotion'" class="npc-trainer-promotion-list">
                    <p class="npc-trainer-promotion-intro">{{ t('classProgression.intro') }}</p>
                    <article
                        v-for="promotion in trainerPromotions"
                        :key="promotion.targetClass"
                        :class="['npc-trainer-promotion-card', { 'npc-trainer-promotion-card--eligible': promotion.eligible }]"
                    >
                        <div class="npc-trainer-promotion-header">
                            <h3><span class="ui-text-gradient">{{ getClassName(promotion.targetClass) }}</span></h3>
                            <span
                                class="npc-trainer-promotion-state"
                                :class="promotion.eligible ? 'npc-trainer-promotion-state--met' : 'npc-trainer-promotion-state--unmet'"
                            >
                                {{ t(promotion.eligible ? 'classProgression.conditionsMet' : 'classProgression.conditionsNotMet') }}
                            </span>
                        </div>
                        <p class="npc-trainer-promotion-description">{{ t(promotion.descriptionKey) }}</p>
                        <div class="npc-trainer-promotion-requirements">
                            <div
                                v-for="requirement in promotion.requirements"
                                :key="requirement.labelKey"
                                class="npc-trainer-promotion-requirement"
                            >
                                <span
                                    v-if="requirement.type === 'skillCount' && requirement.skillGroup && requirement.count != null && requirement.minimumRank != null"
                                    class="ui-text-gradient"
                                >
                                    {{ t('classProgression.phrases.atLeast') }}
                                    <strong :class="['npc-trainer-promotion-requirement-accent', requirement.met ? 'npc-trainer-promotion-requirement-accent--met' : 'npc-trainer-promotion-requirement-accent--unmet']">{{ requirement.count }}</strong>&nbsp;
                                    <strong :class="['npc-trainer-promotion-requirement-accent', requirement.met ? 'npc-trainer-promotion-requirement-accent--met' : 'npc-trainer-promotion-requirement-accent--unmet']">{{ t(`classProgression.skillGroups.${requirement.skillGroup}`) }}</strong>
                                    {{ t('classProgression.phrases.atRank') }}
                                    <strong :class="['npc-trainer-promotion-requirement-accent', requirement.met ? 'npc-trainer-promotion-requirement-accent--met' : 'npc-trainer-promotion-requirement-accent--unmet']">{{ getSkillRankName(requirement.minimumRank) }}</strong>
                                </span>
                                <span
                                    v-else-if="requirement.type === 'skill' && requirement.skill && requirement.minimumRank != null"
                                    class="ui-text-gradient"
                                >
                                    <strong :class="['npc-trainer-promotion-requirement-accent', requirement.met ? 'npc-trainer-promotion-requirement-accent--met' : 'npc-trainer-promotion-requirement-accent--unmet']">{{ getPromotionRequirementSkillName(requirement) }}</strong>
                                    {{ t('classProgression.phrases.atRank') }}
                                    <strong :class="['npc-trainer-promotion-requirement-accent', requirement.met ? 'npc-trainer-promotion-requirement-accent--met' : 'npc-trainer-promotion-requirement-accent--unmet']">{{ getSkillRankName(requirement.minimumRank) }}</strong>
                                </span>
                                <span v-else class="ui-text-gradient">{{ t(requirement.labelKey) }}</span>
                            </div>
                        </div>
                        <div v-if="promotion.eligible" class="npc-trainer-promotion-actions">
                            <button type="button" class="dialog-button npc-vendor-buy-button npc-vendor-purchase-button" @click.stop>
                                <span class="ui-text-gradient--button-state">{{ t('classProgression.promote') }}</span>
                            </button>
                        </div>
                    </article>
                    <div v-if="trainerPromotions.length === 0" class="npc-use-empty-state">
                        {{ t('classProgression.noPromotions') }}
                    </div>
                </div>
            </template>

            <template v-else-if="selectedFeature?.type === 'crafting'">
                <div v-if="selectedFeature.craftingCategories?.length" class="npc-use-category-tabs">
                    <button
                        v-for="category in selectedFeature.craftingCategories"
                        :key="category"
                        class="dialog-button npc-use-tab"
                        @click="openCrafting(category, $event)"
                    >
                        <span class="ui-text-gradient--button-state">
                            {{ getCategoryLabel(category) }}
                        </span>
                    </button>
                </div>
                <div v-else class="npc-use-empty-state">{{ t('vendor.emptyCategory') }}</div>
            </template>

            <div v-else-if="selectedFeature" class="npc-use-empty-state">{{ t('vendor.featureNotAvailable') }}</div>
            <div v-else class="npc-use-empty-state">{{ t('vendor.noFeatures') }}</div>
        </div>

        <template #overlay>
            <div
                v-for="effect in purchaseEffects"
                :key="effect.id"
                class="npc-purchase-effect"
                :class="{ 'npc-purchase-effect-error': effect.error }"
                :style="{ left: `${effect.x}px`, top: `${effect.y}px` }"
            >
                {{ effect.text }}
            </div>
            <div v-if="detailItem" class="npc-vendor-item-overlay" :style="detailOverlayStyle" @click="detailItem = null">
                <div class="npc-vendor-overlay-name"><span class="ui-text-gradient">{{ getItemName(detailItem) }}</span></div>
                <div v-if="detailWeaponDurability || detailEquipmentCategoryLabel" class="npc-vendor-overlay-category-row">
                    <span v-if="detailWeaponDurability" :class="['npc-vendor-overlay-durability', detailWeaponDurabilityStatus ? `item-durability--${detailWeaponDurabilityStatus}` : null]">{{ t('inventory.durability') }}: <strong>{{ detailWeaponDurability }}</strong></span>
                    <span v-if="detailEquipmentCategoryLabel" class="inventory-item-overlay-weapon-category">{{ detailEquipmentCategoryLabel }}</span>
                </div>
                <div v-if="detailItem.tp === 'W'" class="npc-vendor-overlay-stats">
                    <span>{{ t('vendor.attack') }} <strong class="ui-text-gradient">{{ detailItem.atts?.patk }}</strong></span>
                    <span>{{ t('vendor.attackType') }} <strong class="ui-text-gradient">{{ formatDamageTypes(detailItem) }}</strong></span>
                    <span>{{ t('vendor.speed') }} <strong class="ui-text-gradient">{{ formatSpeed(detailItem.atts?.speed) }}</strong></span>
                    <span>{{ t('vendor.range') }} <strong class="ui-text-gradient">{{ detailItem.atts?.range }}</strong></span>
                    <span v-if="isNonZero(detailItem.atts?.armorPen)">{{ t('inventory.armorPenetration') }} <strong class="ui-text-gradient">{{ detailItem.atts?.armorPen }}</strong></span>
                    <span v-if="isNonZero(detailItem.atts?.defense)">{{ t('inventory.defense') }} <strong class="ui-text-gradient">{{ formatModifier(detailItem.atts?.defense) }}</strong></span>
                </div>
                <div v-else-if="detailItem.tp === 'A'" class="npc-vendor-overlay-stats">
                    <span>{{ t('inventory.armor') }} <strong class="ui-text-gradient">{{ detailItem.atts?.pdef }}</strong></span>
                    <span>{{ t('inventory.magicInterference') }} <strong class="ui-text-gradient">{{ detailItem.atts?.arcaneInterference }}%</strong></span>
                    <span v-if="isNonZero(detailItem.atts?.defense)">{{ t('inventory.defense') }} <strong class="ui-text-gradient">{{ formatModifier(detailItem.atts?.defense) }}</strong></span>
                    <span v-if="isNonZero(detailItem.atts?.str)">{{ t('character.strength') }} <strong class="ui-text-gradient">{{ formatModifier(detailItem.atts?.str) }}</strong></span>
                    <span v-if="isNonZero(detailItem.atts?.agi)">{{ t('character.agility') }} <strong class="ui-text-gradient">{{ formatModifier(detailItem.atts?.agi) }}</strong></span>
                    <span v-if="isNonZero(detailItem.atts?.int)">{{ t('character.intelligence') }} <strong class="ui-text-gradient">{{ formatModifier(detailItem.atts?.int) }}</strong></span>
                    <span v-if="isNonZero(detailItem.atts?.wis)">{{ t('character.wisdom') }} <strong class="ui-text-gradient">{{ formatModifier(detailItem.atts?.wis) }}</strong></span>
                    <span v-if="isNonZero(detailItem.atts?.maxHp)">{{ t('inventory.maxHealth') }} <strong class="ui-text-gradient">{{ formatModifier(detailItem.atts?.maxHp) }}</strong></span>
                </div>
                <div v-else class="npc-vendor-overlay-muted">{{ t('vendor.detailsSoon') }}</div>
            </div>
            <ItemInfoOverlay
                v-if="repairItemInfoOverlay.visible"
                ref="repairItemInfoOverlayRef"
                :item-info="repairItemInfoOverlay"
                context="REPAIR"
                :x="repairItemInfoOverlay.x"
                :y="repairItemInfoOverlay.y"
                :action-button-size="0"
                @close="hideRepairItemInfoOverlay"
            />
        </template>
    </GameDialog>
</template>

<script setup lang="ts">
import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue'
import GameDialog from '@/vue/views/GameDialog.vue'
import {NpcInteractionManager} from '@/data/npcInteractionManager'
import type {ClassPromotionRequirementData, NpcHealerService, NpcUseData, NpcUseFeatureData, NpcVendorCatalogItem, SkillKey} from '@/network/messageIfs'
import {t} from '@/i18n'
import {EmeraldsManager} from '@/gui/emeraldsManager'
import {InventoryManager} from '@/data/inventoryManager'
import {NpcManager} from '@/babylon/npc/npcManager'
import {BankManager} from '@/data/bankManager'
import BankPanel from '@/vue/views/npc/BankPanel.vue'
import {MyPlayer} from '@/data/myPlayer'
import type {Item} from '@/data/items/item'
import {SkillDefinitions} from '@/data/skills/skillDefinitions'
import type {SkillCategoryKey} from '@/data/skills/skillDefinitions'
import ItemInfoOverlay from '@/vue/views/inventory/itemInfoOverlay.vue'
import {getArmorCategoryLabel, getItemDurabilityStatus, getItemTooltipData, getWeaponCategoryLabel, type ItemDurabilityStatus} from '@/vue/views/inventory/itemTooltip'

const emit = defineEmits(['close'])

const featureLabels: Record<string, string> = {vendor: 'vendor.vendor', repairer: 'vendor.repairer', crafting: 'vendor.crafting', banker: 'vendor.banker', healer: 'vendor.healer', trainer: 'vendor.trainer'}
const categoryLabels: Record<string, string> = {weapons: 'vendor.weapons', bows: 'vendor.bows', metalArmor: 'vendor.metalArmor', leatherArmor: 'vendor.leatherArmor', jewels: 'vendor.jewels', resources: 'vendor.resources', trinkets: 'vendor.trinkets'}
const itemTypeLocalizationSections: Record<string, string> = {W: 'weapons', A: 'armors', J: 'jewels', T: 'trinkets', R: 'resources'}
const damageTypeLabels: Record<string, string> = {PHYSICAL_SLASH: 'vendor.damageSlash', PHYSICAL_PIERCE: 'vendor.damagePierce', PHYSICAL_BLUNT: 'vendor.damageBlunt'}
const skillRankTranslationKeys: Partial<Record<number, string>> = {
    0: 'skills.ranks.untrained',
    1: 'skills.ranks.novice',
    2: 'skills.ranks.neophyte',
    3: 'skills.ranks.apprentice',
    4: 'skills.ranks.expert',
    5: 'skills.ranks.journeyman',
    6: 'skills.ranks.veteran',
    7: 'skills.ranks.master',
    8: 'skills.ranks.highMaster',
    9: 'skills.ranks.exemplar',
    10: 'skills.ranks.grandmaster',
}
const IGNORE_BACKDROP_CLICK_AFTER_OPEN_MS = 350
const NPC_PURCHASE_DISTANCE = 4
const NPC_FEATURE_TAB_STORAGE_KEY = 'DARKENLIGHT_NPC_FEATURE_TAB'
const NPC_VENDOR_CATEGORY_TAB_STORAGE_KEY = 'DARKENLIGHT_NPC_VENDOR_CATEGORY_TAB'

type PurchaseEffect = {
    id: number
    text: string
    x: number
    y: number
    error: boolean
}

type RepairItem = {
    item: Item
    price: number
    durabilityStatus: ItemDurabilityStatus | null
}

type TrainerTab = 'training' | 'newSkills' | 'promotion'

const trainerTabs: TrainerTab[] = ['training', 'newSkills', 'promotion']

const dialogVisible = ref(false)
const npcData = ref<NpcUseData | null>(null)
const selectedFeatureIndex = ref(0)
const selectedCategory = ref('')
const selectedTrainerTab = ref<TrainerTab>('training')
const detailItem = ref<NpcVendorCatalogItem | null>(null)
const detailOverlayPosition = ref({x: 0, y: 0})
const repairItemInfoOverlayRef = ref<{ getBoundingClientRect?: () => DOMRect } | null>(null)
const repairItemInfoOverlay = ref({
    visible: false,
    sourceItemId: null as number | null,
    x: 0,
    y: 0,
    name: '',
    quality: null,
    durability: null,
    durabilityMax: null,
    quantity: null,
    weaponCategory: null,
    armorCategory: null,
    weaponAttack: null,
    weaponDamageTypes: [],
    weaponSpeed: null,
    weaponRange: null,
    weaponArmorPen: null,
    weaponDefense: null,
    armorStats: null,
})
const resourceInventoryVersion = ref(0)
const openedAt = ref(0)
const purchaseEffects = ref<PurchaseEffect[]>([])
const bankLoading = ref(false)
let nextPurchaseEffectId = 0

const features = computed(() => npcData.value?.features ?? [])
const selectedFeature = computed<NpcUseFeatureData | null>(() => features.value[selectedFeatureIndex.value] ?? null)
const vendorCategories = computed(() => Object.entries(selectedFeature.value?.categories ?? {}).map(([key, items]) => ({key, items})).filter((category) => category.items.length > 0))
const selectedCategoryItems = computed(() => [...(selectedFeature.value?.categories?.[selectedCategory.value] ?? [])]
    .sort((first, second) => first.price - second.price || first.name.localeCompare(second.name)))
const repairItems = computed(() => {
    resourceInventoryVersion.value
    const repairPrices = new Map((selectedFeature.value?.repairItems ?? []).map((repairItem) => [repairItem.id, repairItem.price]))
    const getRepairItems = (items: Item[]): RepairItem[] => items
        .map((item) => ({item, price: repairPrices.get(item.id), durabilityStatus: getItemDurabilityStatus(item)}))
        .filter((repairItem): repairItem is RepairItem => repairItem.price !== undefined && getItemDurability(repairItem.item) < getItemMaxDurability(repairItem.item))
        .sort((first, second) => first.price - second.price || (first.item.name ?? '').localeCompare(second.item.name ?? ''))
    return {
        equipment: getRepairItems(Array.from(MyPlayer.myChar?.equipSet?.values?.() ?? [])),
        inventory: getRepairItems(InventoryManager.inventory),
    }
})
const trainerNewSkills = computed(() => {
    const skillSet = MyPlayer.myCharRef.value?.skillSet ?? {}
    const skillCaps = MyPlayer.myCharRef.value?.skillCaps ?? {}

    return SkillDefinitions.filter((skill) => (skillCaps[skill.key] ?? 0) >= 1 && !skillSet[skill.key])
})
const trainerSkillCategoryOrder: SkillCategoryKey[] = ['weapons', 'armor', 'utility']
const trainerNewSkillCategories = computed(() => trainerSkillCategoryOrder
    .map((key) => ({key, skills: trainerNewSkills.value.filter((skill) => skill.category === key)}))
    .filter((category) => category.skills.length > 0))
const trainerSkillLearningPrice = computed(() => selectedFeature.value?.skillLearningPrice ?? 0)
const trainerPromotions = computed(() => selectedFeature.value?.promotions ?? [])

watch(trainerNewSkills, (skills) => {
    if (skills.length === 0 && selectedTrainerTab.value === 'newSkills') {
        selectedTrainerTab.value = 'training'
    }
})

const detailOverlayStyle = computed(() => ({left: `${detailOverlayPosition.value.x}px`, top: `${detailOverlayPosition.value.y}px`}))
const detailWeaponCategoryLabel = computed(() => detailItem.value?.tp === 'W' ? getWeaponCategoryLabel(detailItem.value.wCat) : null)
const detailArmorCategoryLabel = computed(() => detailItem.value?.tp === 'A' ? getArmorCategoryLabel(detailItem.value.aCat) : null)
const detailEquipmentCategoryLabel = computed(() => detailWeaponCategoryLabel.value || detailArmorCategoryLabel.value)
const detailWeaponDurability = computed(() => {
    const durability = Number(detailItem.value?.atts?.dur)
    const maxDurability = Number(detailItem.value?.atts?.durM)
    return Number.isFinite(durability) && Number.isFinite(maxDurability) ? `${durability} / ${maxDurability}` : null
})
const detailWeaponDurabilityStatus = computed<ItemDurabilityStatus | null>(() => {
    const durability = Number(detailItem.value?.atts?.dur)
    const maxDurability = Number(detailItem.value?.atts?.durM)
    if (!Number.isFinite(durability) || !Number.isFinite(maxDurability)) {
        return null
    }
    if (durability < 5) return 'critical'
    if (durability < 15) return 'danger'
    if (durability < 25) return 'warning'
    return 'worn'
})
const formattedEmeralds = computed(() => EmeraldsManager.formatEmeraldAmount(EmeraldsManager.emeralds.value))

const getFeatureLabel = (type: string) => t(featureLabels[type] ?? type)
const getCategoryLabel = (category: string) => t(categoryLabels[category] ?? category)
const getClassName = (classKey: string) => {
    const localizationKey = `classes.${classKey.toLowerCase()}`
    const localizedName = t(localizationKey)
    return localizedName === localizationKey ? classKey : localizedName
}
const getSkillRankName = (rank: number) => {
    const translationKey = skillRankTranslationKeys[rank]
    return translationKey ? t(translationKey) : t('skills.ranks.fallback', {rank})
}
const getPromotionRequirementSkillName = (requirement: ClassPromotionRequirementData) => {
    const definition = SkillDefinitions.find((skill) => skill.key === requirement.skill)
    return definition ? t(definition.translationKey) : t(requirement.labelKey)
}
const getItemName = (item: NpcVendorCatalogItem) => {
    const section = itemTypeLocalizationSections[item.tp]
    const key = section ? `items.${section}.${item.name}` : item.name
    const localized = t(key)
    const name = localized === key ? item.name : localized
    return item.bundleSize && item.bundleSize > 1 ? `${item.bundleSize}× ${name}` : name
}
const getItemImage = (item: NpcVendorCatalogItem) => item.img ? `/images/items/${item.img}.png` : '/images/icons/buttons/btn_backpack.png'
const getServiceImage = (service: NpcHealerService) => `/${service.img}.png`
const formatDamageTypes = (item: NpcVendorCatalogItem) => (item.dmgTypes ?? []).map((type) => t(damageTypeLabels[type] ?? type)).join(' / ')
const formatSpeed = (speed: number | string | undefined) => {
    const milliseconds = Number(speed)
    return Number.isFinite(milliseconds) ? `${(milliseconds / 1000).toFixed(2)}s` : '-'
}
const isNonZero = (value: number | string | undefined) => Number(value) !== 0
const formatModifier = (value: number | string | undefined) => {
    const number = Number(value)
    return `${number > 0 ? '+' : ''}${number}`
}
const getTotalPrice = (item: NpcVendorCatalogItem) => item.price
const getItemAttribute = (item: Item, attribute: string) => {
    const attributes = item.atts as unknown as Record<string, number | string> & {get?: (key: string) => number | string | undefined}
    return Number(typeof attributes.get === 'function' ? attributes.get(attribute) : attributes[attribute])
}
const getItemDurability = (item: Item) => getItemAttribute(item, 'dur')
const getItemMaxDurability = (item: Item) => getItemAttribute(item, 'durM')
const getRepairDurabilityPercent = (item: Item) => {
    const durability = getItemDurability(item)
    const maxDurability = getItemMaxDurability(item)
    if (!Number.isFinite(durability) || !Number.isFinite(maxDurability) || maxDurability <= 0) {
        return 0
    }
    return Math.max(0, Math.min(100, (durability / maxDurability) * 100))
}
const getRepairItemImage = (item: Item) => item.imgUrl ? `/${item.imgUrl}` : '/images/icons/buttons/btn_backpack.png'
const getOwnedResourceCount = (item: NpcVendorCatalogItem) => {
    resourceInventoryVersion.value
    return InventoryManager.getTotalResourceItemCountByType(item.cb)
}

const getPreferredVendorCategory = (feature: NpcUseFeatureData | undefined) => {
    const categories = Object.entries(feature?.categories ?? {}).filter(([, items]) => items.length > 0)
    const storedCategory = localStorage.getItem(NPC_VENDOR_CATEGORY_TAB_STORAGE_KEY)
    return categories.some(([category]) => category === storedCategory)
        ? storedCategory!
        : categories[0]?.[0] ?? ''
}

const selectFeature = (index: number, remember: boolean = true) => {
    const feature = features.value[index]
    if (!feature) {
        return
    }

    selectedFeatureIndex.value = index
    selectedCategory.value = getPreferredVendorCategory(feature)
    if (feature.type === 'banker' && npcData.value) {
        BankManager.clear()
        bankLoading.value = true
        NpcInteractionManager.openBank(npcData.value.id)
    }
    if (feature.type === 'trainer') {
        selectedTrainerTab.value = 'training'
    }
    if (remember) {
        localStorage.setItem(NPC_FEATURE_TAB_STORAGE_KEY, feature.type)
    }
    hideItemOverlays()
}

const selectCategory = (category: string) => {
    selectedCategory.value = category
    localStorage.setItem(NPC_VENDOR_CATEGORY_TAB_STORAGE_KEY, category)
    hideItemOverlays()
}

const hideRepairItemInfoOverlay = () => {
    repairItemInfoOverlay.value.visible = false
    repairItemInfoOverlay.value.sourceItemId = null
}

const hideItemOverlays = () => {
    detailItem.value = null
    hideRepairItemInfoOverlay()
}

const clampRepairItemInfoOverlayPosition = () => {
    const overlayRect = repairItemInfoOverlayRef.value?.getBoundingClientRect?.()
    if (!overlayRect) {
        return
    }

    repairItemInfoOverlay.value.x = Math.max(8, Math.min(repairItemInfoOverlay.value.x, window.innerWidth - overlayRect.width - 8))
    repairItemInfoOverlay.value.y = Math.max(8, Math.min(repairItemInfoOverlay.value.y, window.innerHeight - overlayRect.height - 8))
}

const showRepairItemDetails = (item: Item, event: MouseEvent | KeyboardEvent) => {
    if (repairItemInfoOverlay.value.visible && repairItemInfoOverlay.value.sourceItemId === item.id) {
        hideRepairItemInfoOverlay()
        return
    }

    detailItem.value = null
    Object.assign(repairItemInfoOverlay.value, getItemTooltipData(item))
    repairItemInfoOverlay.value.visible = true
    repairItemInfoOverlay.value.sourceItemId = item.id
    repairItemInfoOverlay.value.x = event instanceof MouseEvent ? event.clientX + 8 : Math.max(12, window.innerWidth / 2 - 135)
    repairItemInfoOverlay.value.y = event instanceof MouseEvent ? event.clientY : Math.max(12, window.innerHeight / 2 - 80)

    nextTick(() => {
        clampRepairItemInfoOverlayPosition()
    })
}

const addPurchaseEffect = (text: string, event: MouseEvent, error: boolean = false) => {
    const effectId = nextPurchaseEffectId++
    purchaseEffects.value.push({
        id: effectId,
        text,
        x: event.clientX,
        y: event.clientY,
        error,
    })
    window.setTimeout(() => {
        purchaseEffects.value = purchaseEffects.value.filter((effect) => effect.id !== effectId)
    }, 750)
}

const buyItem = (item: NpcVendorCatalogItem, quantity: number, event: MouseEvent) => {
    detailItem.value = null
    const npc = npcData.value ? NpcManager.npcs.get(npcData.value.id) : null
    if (!npc || npc.getDistanceFromMyPlayer() > NPC_PURCHASE_DISTANCE) {
        addPurchaseEffect(t('messages.npcUseOutOfRange'), event, true)
        return
    }

    const totalPrice = item.price * quantity
    if (EmeraldsManager.myEmeralds < totalPrice) {
        addPurchaseEffect(t('vendor.notEnoughEmeralds'), event, true)
        return
    }

    addPurchaseEffect(`-${EmeraldsManager.formatEmeraldAmount(totalPrice)}`, event)
    if (npcData.value) {
        NpcInteractionManager.purchase(npcData.value.id, item, quantity)
    }
}

const buyHealerService = (service: NpcHealerService, event: MouseEvent) => {
    const npc = npcData.value ? NpcManager.npcs.get(npcData.value.id) : null
    if (!npc || npc.getDistanceFromMyPlayer() > NPC_PURCHASE_DISTANCE) {
        addPurchaseEffect(t('messages.npcUseOutOfRange'), event, true)
        return
    }
    if (service.price < 1) {
        return
    }
    if (EmeraldsManager.myEmeralds < service.price) {
        addPurchaseEffect(t('vendor.notEnoughEmeralds'), event, true)
        return
    }

    addPurchaseEffect(`-${EmeraldsManager.formatEmeraldAmount(service.price)}`, event)
    if (npcData.value) {
        NpcInteractionManager.purchaseHealerService(npcData.value.id)
        service.price = 0
    }
}

const repairSelectedItem = (repairItem: RepairItem, event: MouseEvent) => {
    hideRepairItemInfoOverlay()
    const npc = npcData.value ? NpcManager.npcs.get(npcData.value.id) : null
    if (!npc || npc.getDistanceFromMyPlayer() > NPC_PURCHASE_DISTANCE) {
        addPurchaseEffect(t('messages.npcUseOutOfRange'), event, true)
        return
    }
    if (EmeraldsManager.myEmeralds < repairItem.price) {
        addPurchaseEffect(t('vendor.notEnoughEmeralds'), event, true)
        return
    }

    addPurchaseEffect(`-${EmeraldsManager.formatEmeraldAmount(repairItem.price)}`, event)
    if (npcData.value) {
        NpcInteractionManager.repair(npcData.value.id, repairItem.item.id)
    }
}

const learnSkill = (skill: SkillKey, event: MouseEvent) => {
    const npc = npcData.value ? NpcManager.npcs.get(npcData.value.id) : null
    if (!npc || npc.getDistanceFromMyPlayer() > NPC_PURCHASE_DISTANCE) {
        addPurchaseEffect(t('messages.npcUseOutOfRange'), event, true)
        return
    }

    const price = trainerSkillLearningPrice.value
    if (EmeraldsManager.myEmeralds < price) {
        addPurchaseEffect(t('vendor.notEnoughEmeralds'), event, true)
        return
    }

    addPurchaseEffect(`-${EmeraldsManager.formatEmeraldAmount(price)}`, event)
    NpcInteractionManager.learnSkill(npcData.value!.id, skill)
}

const openCrafting = (category: string, event: MouseEvent) => {
    const npc = npcData.value ? NpcManager.npcs.get(npcData.value.id) : null
    if (!npc || npc.getDistanceFromMyPlayer() > NPC_PURCHASE_DISTANCE) {
        addPurchaseEffect(t('messages.npcUseOutOfRange'), event, true)
        return
    }
    if (!npcData.value) {
        return
    }
    closeDialog()
    NpcInteractionManager.openCrafting(npcData.value.id, category)
}

const showItemDetails = (item: NpcVendorCatalogItem, event: MouseEvent | KeyboardEvent) => {
    if (detailItem.value?.tp === item.tp && detailItem.value.cb === item.cb) {
        detailItem.value = null
        return
    }
    detailItem.value = item
    detailOverlayPosition.value = event instanceof MouseEvent
        ? {x: Math.max(8, Math.min(event.clientX + 8, window.innerWidth - 280)), y: Math.max(8, Math.min(event.clientY + 8, window.innerHeight - 160))}
        : {x: Math.max(12, window.innerWidth / 2 - 135), y: Math.max(12, window.innerHeight / 2 - 80)}
}

const openDialog = (data: NpcUseData) => {
    npcData.value = data
    const storedFeature = localStorage.getItem(NPC_FEATURE_TAB_STORAGE_KEY)
    const storedFeatureIndex = data.features.findIndex((feature) => feature.type === storedFeature)
    selectFeature(storedFeatureIndex >= 0 ? storedFeatureIndex : 0, false)
    openedAt.value = Date.now()
    dialogVisible.value = true
}

const closeDialog = () => {
    hideItemOverlays()
    bankLoading.value = false
    BankManager.clear()
    dialogVisible.value = false
    emit('close')
}

const onBackdropClick = () => {
    if ((Date.now() - openedAt.value) < IGNORE_BACKDROP_CLICK_AFTER_OPEN_MS) {
        return
    }

    closeDialog()
}

const refreshResourceInventoryCounts = () => {
    resourceInventoryVersion.value++
}

const onBankUpdated = () => {
    bankLoading.value = false
}

onMounted(() => {
    window.addEventListener('ui:inventory-updated', refreshResourceInventoryCounts)
    window.addEventListener('ui:bank-updated', onBankUpdated)
})

onUnmounted(() => {
    window.removeEventListener('ui:inventory-updated', refreshResourceInventoryCounts)
    window.removeEventListener('ui:bank-updated', onBankUpdated)
})

defineExpose({openDialog})
</script>

<style scoped>
.npc-use-dialog-window .dialog-content { display: block; }
.npc-use-header { display: flex; align-items: center; gap: 8px; min-width: 0; }
.npc-use-feature-tabs { display: flex; min-width: 0; overflow-x: auto; }
.npc-use-emeralds { display: inline-flex; flex: 0 0 auto; align-self: stretch; align-items: center; gap: 4px; margin-left: auto; padding: 0 6px; background: rgba(0, 0, 0, 0.25); color: #7ef58e; font-size: 14px; text-shadow: 0 0 3px #000; white-space: nowrap; }
.npc-use-emeralds .ui-emerald-text-gradient { text-shadow: none; }
.npc-use-emeralds img { width: 18px; height: 18px; object-fit: contain; }
.npc-use-content-shell { display: flex; flex-direction: column; width: 100%; height: min(600px, calc(85vh - 48px)); box-sizing: border-box; padding: 10px; gap: 10px; overflow: hidden; }
.npc-use-category-tabs { display: flex; flex-wrap: wrap; gap: 6px; flex: 0 0 auto; }
.npc-use-tab { min-width: 82px; }
.npc-use-tab.selected,
.npc-use-tab:not(:disabled):hover {
    background-image: linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url('/images/gui/bck_stone1.png');
}
.npc-vendor-purchase-button:not(:disabled):hover {
    background-image: linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url('/images/gui/bck_stone1.png');
}
.npc-use-tab, .npc-vendor-buy-button, .npc-vendor-quick-buy-button { padding: 5px 10px; font-size: 0.9rem; line-height: 1; }
.npc-trainer-skill-list { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; overflow-y: auto; }
.npc-trainer-skill-category { margin-top: 4px; }
.npc-trainer-skill-category + .npc-trainer-skill-category { margin-top: 10px; }
.npc-trainer-skill-category-title { margin: 0 0 5px; padding: 0 2px; color: rgb(var(--ui-base)); font-size: clamp(13px, 1.8vh, 16px); font-weight: 700; line-height: 1.15; text-align: center; }
.npc-trainer-skill-category-list { border-top: 1px solid rgba(var(--ui-darker), 0.8); border-bottom: 1px solid rgba(var(--ui-darker), 0.8); }
.npc-trainer-skill-row { display: grid; grid-template-columns: minmax(120px, 0.65fr) minmax(0, 1fr) max-content auto; align-items: center; gap: 12px; min-height: 46px; padding: 3px 8px; border-bottom: 1px solid rgba(var(--ui-darker), 0.65); }
.npc-trainer-skill-row:last-child { border-bottom: 0; }
.npc-trainer-skill-name { justify-self: start; color: rgb(var(--ui-base)); font-weight: 700; text-align: left; }
.npc-trainer-skill-description { min-width: 0; color: rgb(var(--ui-dark)); font-size: 12px; line-height: 1.2; text-align: left; }
.npc-trainer-promotion-list { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; gap: 8px; overflow-y: auto; }
.npc-trainer-promotion-intro { margin: 0 2px 3px; color: rgb(var(--ui-dark)); font-size: 13px; line-height: 1.35; text-align: left; }
.npc-trainer-promotion-card { padding: 9px 10px; border: 1px solid rgba(var(--ui-darker), 0.75); background: rgba(var(--ui-darker), 0.18); }
.npc-trainer-promotion-card--eligible {
    animation: npc-trainer-promotion-glow 2.2s ease-in-out infinite;
    border-color: rgba(var(--ui-accent-blue), 0.42);
    box-shadow: inset 0 0 0 1px rgba(var(--ui-accent-blue), 0.42), inset 0 0 20px rgba(var(--ui-accent-blue), 0.35);
}
.npc-trainer-promotion-header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.npc-trainer-promotion-header h3 { margin: 0; color: rgb(var(--ui-base)); font-size: 1rem; }
.npc-trainer-promotion-state { flex: 0 0 auto; font-size: 12px; font-weight: 700; }
.npc-trainer-promotion-state--met { color: rgb(var(--ui-success)); }
.npc-trainer-promotion-state--unmet { color: rgb(var(--ui-danger)); }
.npc-trainer-promotion-description { margin: 5px 0 7px; color: rgb(var(--ui-dark)); font-size: 12px; line-height: 1.25; text-align: left; }
.npc-trainer-promotion-requirements { display: flex; flex-direction: column; }
.npc-trainer-promotion-requirement { padding: 4px 0; border-top: 1px solid rgba(var(--ui-darker), 0.45); color: rgba(var(--ui-base), 0.82); font-size: 12px; text-align: left; }
.npc-trainer-promotion-requirement .npc-trainer-promotion-requirement-accent { font-weight: 400; }
.npc-trainer-promotion-requirement-accent--met { color: rgb(var(--ui-success)); -webkit-text-fill-color: rgb(var(--ui-success)); }
.npc-trainer-promotion-requirement-accent--unmet { color: rgb(var(--ui-danger)); -webkit-text-fill-color: rgb(var(--ui-danger)); }
.npc-trainer-promotion-actions { display: flex; justify-content: flex-end; margin-top: 7px; }

@keyframes npc-trainer-promotion-glow {
    50% {
        border-color: rgba(var(--ui-accent-blue), 0.68);
        box-shadow: inset 0 0 0 1px rgba(var(--ui-accent-blue), 0.68), inset 0 0 28px rgba(var(--ui-accent-blue), 0.56);
    }
}

.npc-use-content-shell :deep(.bank-panel) { flex: 1 1 auto; min-height: 0; }
.npc-vendor-item-list { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; overflow-y: auto; border-top: 1px solid rgba(var(--ui-darker), 0.8); border-bottom: 1px solid rgba(var(--ui-darker), 0.8); }
.npc-vendor-item-row { display: grid; grid-template-columns: 46px minmax(0, 1fr) max-content auto; align-items: center; gap: 12px; min-height: 46px; padding: 3px 8px; border-bottom: 1px solid rgba(var(--ui-darker), 0.65); color: rgb(var(--ui-base)); cursor: url('/images/cursor-pointer.png'), pointer; }
.npc-vendor-catalog-list { border-top: 0; border-bottom: 0; }
.npc-vendor-catalog-list .npc-vendor-item-row:last-child { border-bottom: 0; }
.npc-repairer-item-row { grid-template-columns: 46px minmax(0, 1fr) 128px 80px auto; }
.npc-repairer-durability { display: flex; flex-direction: column; align-items: stretch; justify-self: end; width: 128px; row-gap: 2px; color: rgb(var(--ui-dark)); font-size: 13px; white-space: nowrap; }
.npc-repairer-durability-value { text-align: center; }
.npc-repairer-durability-track { align-self: center; width: 75%; height: 6px; overflow: hidden; border: 1px solid rgba(var(--ui-darkest), 0.5); background: rgb(var(--ui-darkest)); }
.npc-repairer-durability-fill { display: block; height: 100%; --ui-progress-gradient-left: var(--ui-dark); --ui-progress-gradient-right: var(--ui-darkest); }
.npc-repairer-durability-fill.item-durability--worn { --ui-progress-gradient-left: var(--ui-progress-experience-dark); --ui-progress-gradient-right: var(--ui-success); }
.npc-repairer-durability-fill.item-durability--warning { --ui-progress-gradient-left: var(--ui-durability-warning-bg); --ui-progress-gradient-right: var(--ui-durability-warning); }
.npc-repairer-durability-fill.item-durability--danger { --ui-progress-gradient-left: var(--ui-durability-danger-bg); --ui-progress-gradient-right: var(--ui-durability-danger); }
.npc-repairer-durability-fill.item-durability--critical { --ui-progress-gradient-left: var(--ui-durability-critical-bg); --ui-progress-gradient-right: var(--ui-danger); }
.npc-repairer-item-row .npc-vendor-item-price { justify-self: end; }
.npc-repairer-durability.item-durability--worn { color: rgb(var(--ui-attribute-agility)); }
.npc-repairer-durability.item-durability--warning { color: rgb(var(--ui-durability-warning)); }
.npc-repairer-durability.item-durability--danger { color: rgb(var(--ui-durability-danger)); }
.npc-repairer-durability.item-durability--critical { color: rgb(var(--ui-danger)); }
.npc-repairer-item-icon { position: relative; width: 40px; height: 40px; }
.npc-repairer-item-icon:is(.item-durability--warning, .item-durability--danger, .item-durability--critical) { display: flex; align-items: center; justify-content: center; background-image: url('/images/gui/bck_stone1.png'); background-repeat: repeat; background-attachment: fixed; }
.npc-repairer-item-icon::before { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0; }
.npc-repairer-item-icon.item-durability--warning::before { background: rgba(var(--ui-durability-warning-bg), 0.86); }
.npc-repairer-item-icon.item-durability--danger::before { background: rgba(var(--ui-durability-danger-bg), 0.86); }
.npc-repairer-item-icon.item-durability--critical::before { background: rgba(var(--ui-durability-critical-bg), 0.86); }
.npc-repairer-item-icon .npc-vendor-item-icon { position: relative; z-index: 1; width: 100%; height: 100%; }
.npc-repairer-item-list { border-top: 0; }
.npc-repairer-section-title { margin: 0 0 5px; padding: 0 2px; color: rgb(var(--ui-base)); font-size: clamp(14px, 2vh, 17px); font-weight: 700; line-height: 1.15; text-align: center; text-transform: none; }
.npc-repairer-section-title:not(:first-child) { margin-top: 16px; }
.npc-vendor-item-row:hover, .npc-trainer-skill-row:hover { background: rgba(255, 255, 255, 0.06); }
.npc-healer-service-row { width: 100%; border: 0; border-bottom: 1px solid rgba(var(--ui-darker), 0.65); background: transparent; color: inherit; font: inherit; text-align: inherit; }
.npc-healer-service-list { border-bottom: 0; }
.npc-healer-service-list .npc-healer-service-row:last-child { border-bottom: 0; }
.npc-healer-service-row:disabled { cursor: default; opacity: 0.55; }
.npc-healer-service-row:disabled:hover { background: transparent; }
.npc-vendor-item-icon { width: 40px; height: 40px; object-fit: contain; }
.npc-vendor-item-icon--tooltip-active { animation: inventory-tooltip-item-image-pulse 1.2s ease-in-out infinite; }
.npc-vendor-item-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; text-align: left; font-size: 14px; font-weight: 700; }
.npc-vendor-item-owned { margin-left: 4px; color: rgb(var(--ui-dark)); font-weight: 400; white-space: nowrap; }
.npc-vendor-item-price { display: inline-flex; align-items: center; gap: 4px; color: #7ef58e; white-space: nowrap; font-size: 15px; }
.npc-vendor-item-price img { width: 19px; height: 19px; object-fit: contain; }
.npc-vendor-catalog-list .npc-vendor-item-row:hover .npc-vendor-item-price { transform-origin: center; animation: npc-vendor-price-pulse 1.2s ease-in-out infinite; }
.npc-vendor-buy-actions { display: flex; justify-content: flex-end; gap: 5px; }
.npc-vendor-buy-button, .npc-vendor-quick-buy-button { min-width: 0; white-space: nowrap; }
.npc-vendor-quick-buy-button { min-width: 42px; }

@keyframes npc-vendor-price-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.25); }
}

.npc-use-empty-state { display: flex; flex: 1 1 auto; align-items: center; justify-content: center; color: rgb(var(--ui-dark)); font-size: 14px; }
.npc-vendor-item-overlay { position: fixed; z-index: 2100; width: 270px; box-sizing: border-box; padding: 10px; border: 1px solid rgb(var(--ui-dark)); background: rgba(15, 11, 8, 0.96); color: rgb(var(--ui-base)); text-align: left; box-shadow: 0 10px 22px rgba(0, 0, 0, 0.65); }
.npc-vendor-overlay-name { font-size: 12px; font-weight: 700; }
.npc-vendor-overlay-category-row { display: flex; justify-content: flex-end; margin-top: 6px; }
.npc-vendor-overlay-durability { color: rgb(var(--ui-dark)); font-size: 12px; }
.npc-vendor-overlay-durability strong { color: inherit; }
.npc-vendor-overlay-durability.item-durability--worn { color: rgb(var(--ui-attribute-agility)); }
.npc-vendor-overlay-durability.item-durability--warning { color: rgb(var(--ui-durability-warning)); }
.npc-vendor-overlay-durability.item-durability--danger { color: rgb(var(--ui-durability-danger)); }
.npc-vendor-overlay-durability.item-durability--critical { color: rgb(var(--ui-danger)); }
.npc-vendor-overlay-stats { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: 5px 10px; margin-top: 9px; font-size: 12px; color: rgb(var(--ui-dark)); }
.npc-vendor-overlay-stats > span { display: flex; justify-content: space-between; gap: 8px; }
.npc-vendor-overlay-stats strong { color: rgb(var(--ui-base)); }
.npc-vendor-overlay-muted { margin-top: 8px; color: rgb(var(--ui-dark)); font-size: 12px; }
.npc-purchase-effect { position: fixed; z-index: 2101; pointer-events: none; color: #ff6262; font-size: 21px; font-weight: 700; line-height: 1; text-shadow: 0 2px 3px #000; animation: npc-purchase-float 750ms ease-out forwards; }
.npc-purchase-effect-error { color: #ff8a63; font-size: 14px; }
@keyframes npc-purchase-float { from { transform: translate(-50%, -50%); opacity: 1; } to { transform: translate(-50%, calc(-50% - 42px)); opacity: 0; } }

@media (min-height: 700px) {
    .npc-vendor-item-row { grid-template-columns: 54px minmax(0, 1fr) max-content auto; min-height: 58px; padding-block: 5px; }
    .npc-repairer-item-row { grid-template-columns: 54px minmax(0, 1fr) 128px 80px auto; }
    .npc-vendor-item-icon { width: 48px; height: 48px; }
    .npc-repairer-item-icon { width: 48px; height: 48px; }
}
</style>
