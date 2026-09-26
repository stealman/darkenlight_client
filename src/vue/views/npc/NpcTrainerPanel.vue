<template>
    <div class="npc-trainer-panel">
        <div class="npc-trainer-tabs">
            <button
                v-for="tab in trainerTabs"
                :key="tab"
                class="dialog-button npc-trainer-tab"
                :class="{ selected: selectedTab === tab }"
                :disabled="tab === 'newSkills' && trainerNewSkills.length === 0"
                @click="selectTab(tab)"
            >
                <span class="ui-text-gradient--button-state">{{ t(`vendor.${tab}`) }}</span>
            </button>
        </div>

        <div v-if="selectedTab === 'newSkills'" class="npc-trainer-skill-list">
            <section v-for="category in trainerNewSkillCategories" :key="category.key" class="npc-trainer-skill-category">
                <h3 class="npc-trainer-skill-category-title">{{ t(`skills.categories.${category.key}`) }}</h3>
                <div class="npc-trainer-skill-category-list">
                    <div v-for="skill in category.skills" :key="skill.key" class="npc-trainer-skill-row">
                        <span class="npc-trainer-skill-name">{{ t(skill.translationKey) }}</span>
                        <span class="npc-trainer-skill-description">{{ t(skill.descriptionTranslationKey) }}</span>
                        <span class="npc-trainer-skill-price">
                            <span class="ui-emerald-text-gradient">{{ trainerSkillLearningPrice }}</span>
                            <img src="/images/icons/emerald.png" alt="Emerald" />
                        </span>
                        <button class="dialog-button npc-trainer-action-button" @click.stop="emit('learn-skill', skill.key, $event)">
                            <span class="ui-text-gradient--button-state">{{ t('vendor.learnSkill') }}</span>
                        </button>
                    </div>
                </div>
            </section>
            <div v-if="trainerNewSkills.length === 0" class="npc-trainer-empty-state">{{ t('vendor.noNewSkills') }}</div>
        </div>

        <div v-else-if="selectedTab === 'promotion'" class="npc-trainer-promotion-list">
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
                    <button type="button" class="dialog-button npc-trainer-promote-button" @click.stop>
                        <span class="ui-text-gradient--button-state">{{ t('classProgression.promote') }}</span>
                    </button>
                </div>
            </article>
            <div v-if="trainerPromotions.length === 0" class="npc-trainer-empty-state">
                {{ t('classProgression.noPromotions') }}
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import {computed, watch} from 'vue'
import type {ClassPromotionRequirementData, NpcUseFeatureData, SkillKey} from '@/network/messageIfs'
import {t} from '@/i18n'
import {MyPlayer} from '@/data/myPlayer'
import {SkillDefinitions} from '@/data/skills/skillDefinitions'
import type {SkillCategoryKey} from '@/data/skills/skillDefinitions'

type TrainerTab = 'training' | 'newSkills' | 'promotion'

const props = defineProps<{
    feature: NpcUseFeatureData
    selectedTab: TrainerTab
}>()

const emit = defineEmits<{
    'update:selectedTab': [tab: TrainerTab]
    'learn-skill': [skill: SkillKey, event: MouseEvent]
}>()

const trainerTabs: TrainerTab[] = ['training', 'newSkills', 'promotion']
const trainerSkillCategoryOrder: SkillCategoryKey[] = ['weapons', 'armor', 'utility']
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

const trainerNewSkills = computed(() => {
    const skillSet = MyPlayer.myCharRef.value?.skillSet ?? {}
    const skillCaps = MyPlayer.myCharRef.value?.skillCaps ?? {}
    return SkillDefinitions.filter((skill) => (skillCaps[skill.key] ?? 0) >= 1 && !skillSet[skill.key])
})
const trainerNewSkillCategories = computed(() => trainerSkillCategoryOrder
    .map((key) => ({key, skills: trainerNewSkills.value.filter((skill) => skill.category === key)}))
    .filter((category) => category.skills.length > 0))
const trainerSkillLearningPrice = computed(() => props.feature.skillLearningPrice ?? 0)
const trainerPromotions = computed(() => props.feature.promotions ?? [])

watch(trainerNewSkills, (skills) => {
    if (skills.length === 0 && props.selectedTab === 'newSkills') {
        emit('update:selectedTab', 'training')
    }
})

const selectTab = (tab: TrainerTab) => emit('update:selectedTab', tab)
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
</script>

<style scoped>
.npc-trainer-panel { display: contents; }
.npc-trainer-tabs { display: flex; flex-wrap: wrap; gap: 6px; flex: 0 0 auto; }
.npc-trainer-tab { min-width: 82px; padding: 5px 10px; font-size: 0.9rem; line-height: 1; }
.npc-trainer-tab.selected,
.npc-trainer-tab:not(:disabled):hover,
.npc-trainer-promote-button:not(:disabled):hover { background-image: linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), url('/images/gui/bck_stone1.png'); }
.npc-trainer-skill-list { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; overflow-y: auto; }
.npc-trainer-skill-category { margin-top: 4px; }
.npc-trainer-skill-category + .npc-trainer-skill-category { margin-top: 10px; }
.npc-trainer-skill-category-title { margin: 0 0 5px; padding: 0 2px; color: rgb(var(--ui-base)); font-size: clamp(13px, 1.8vh, 16px); font-weight: 700; line-height: 1.15; text-align: center; }
.npc-trainer-skill-category-list { border-top: 1px solid rgba(var(--ui-darker), 0.8); border-bottom: 1px solid rgba(var(--ui-darker), 0.8); }
.npc-trainer-skill-row { display: grid; grid-template-columns: minmax(120px, 0.65fr) minmax(0, 1fr) max-content auto; align-items: center; gap: 12px; min-height: 46px; padding: 3px 8px; border-bottom: 1px solid rgba(var(--ui-darker), 0.65); }
.npc-trainer-skill-row:last-child { border-bottom: 0; }
.npc-trainer-skill-name { justify-self: start; color: rgb(var(--ui-base)); font-weight: 700; text-align: left; }
.npc-trainer-skill-description { min-width: 0; color: rgb(var(--ui-dark)); font-size: 12px; line-height: 1.2; text-align: left; }
.npc-trainer-skill-row:hover { background: rgba(255, 255, 255, 0.06); }
.npc-trainer-skill-price { display: inline-flex; align-items: center; gap: 4px; color: #7ef58e; white-space: nowrap; font-size: 15px; }
.npc-trainer-skill-price img { width: 19px; height: 19px; object-fit: contain; }
.npc-trainer-action-button { padding: 5px 10px; font-size: 0.9rem; line-height: 1; white-space: nowrap; }
.npc-trainer-promotion-list { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; gap: 8px; overflow-y: auto; }
.npc-trainer-promotion-intro { margin: 0 2px 3px; color: rgb(var(--ui-dark)); font-size: 13px; line-height: 1.35; text-align: left; }
.npc-trainer-promotion-card { padding: 9px 10px; border: 1px solid rgba(var(--ui-darker), 0.75); background: rgba(var(--ui-darker), 0.18); }
.npc-trainer-promotion-card--eligible { animation: npc-trainer-promotion-glow 2.2s ease-in-out infinite; border-color: rgba(var(--ui-accent-blue), 0.42); box-shadow: inset 0 0 0 1px rgba(var(--ui-accent-blue), 0.42), inset 0 0 20px rgba(var(--ui-accent-blue), 0.35); }
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
.npc-trainer-promote-button { padding: 5px 10px; font-size: 0.9rem; line-height: 1; white-space: nowrap; }
.npc-trainer-empty-state { display: flex; flex: 1 1 auto; align-items: center; justify-content: center; color: rgb(var(--ui-dark)); font-size: 14px; }

@keyframes npc-trainer-promotion-glow {
    50% {
        border-color: rgba(var(--ui-accent-blue), 0.68);
        box-shadow: inset 0 0 0 1px rgba(var(--ui-accent-blue), 0.68), inset 0 0 28px rgba(var(--ui-accent-blue), 0.56);
    }
}
</style>
