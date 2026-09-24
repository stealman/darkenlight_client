<template>
    <div class="character-tab-panel character-skills-tab">
        <div v-if="activeTrainingSkill" class="active-training-summary">
            <span>{{ t('skills.progress.currentTraining') }}</span>
            <span class="active-training-summary-accent">{{ activeTrainingSkill.name }}</span>
            <span>{{ t('skills.progress.toRank') }}</span>
            <span class="active-training-summary-accent">{{ getSkillRankName(activeTrainingSkill.rank + 1) }}</span>
            <span>{{ t('skills.progress.remainingTime') }}</span>
            <span class="active-training-summary-accent">
                {{ formatTrainingTime(activeTrainingSkill.trainingRemainingSeconds) }}
            </span>
        </div>
        <section v-for="category in visibleSkillCategories" :key="category.key" class="skill-category">
            <h3 class="skill-category-title">{{ t(`skills.categories.${category.key}`) }}</h3>
            <div class="skill-list">
                <div
                    v-for="skill in category.skills"
                    :key="skill.key"
                    class="skill-row"
                    :class="{
                        'skill-row--expanded': expandedSkillKey === skill.key,
                        'skill-row--active-training': skill.activeTraining,
                    }"
                >
                    <div
                        class="skill-row-summary"
                        :class="{
                            'skill-row--untrained': !skill.progress,
                            'skill-row--capped': skill.progress && skill.nextExperienceRequired == null,
                        }"
                        role="button"
                        tabindex="0"
                        :aria-expanded="expandedSkillKey === skill.key"
                        :aria-controls="skillDetailsId(skill.key)"
                        @click="toggleSkillDetails(skill.key)"
                        @keydown.enter="toggleSkillDetails(skill.key)"
                        @keydown.space.prevent="toggleSkillDetails(skill.key)"
                    >
                    <span class="skill-name">{{ skill.name }}</span>
                    <template v-if="skill.nextExperienceRequired != null">
                        <span class="skill-progress-rank skill-progress-rank--current">{{ getSkillRankName(skill.rank) }}</span>
                        <div class="skill-progress-stack">
                            <div class="skill-progress-row">
                                <span class="skill-progress-track">
                                    <span class="skill-progress-fill skill-progress-fill--experience" :style="{ width: `${skill.experiencePercent}%` }"></span>
                                </span>
                            </div>
                            <div class="skill-progress-row">
                                <span class="skill-progress-track">
                                    <span class="skill-progress-fill skill-progress-fill--training" :style="{ width: `${skill.trainingPercent}%` }"></span>
                                </span>
                            </div>
                        </div>
                        <span class="skill-progress-rank skill-progress-rank--next">{{ getSkillRankName(skill.rank + 1) }}</span>
                        <span v-if="skill.needsExperience" class="skill-experience-shortage">
                            {{ insufficientExperienceLabel }}
                        </span>
                        <button
                            v-else-if="!skill.activeTraining"
                            type="button"
                            class="skill-training-button dialog-button"
                            @click.stop="startTraining(skill.key)"
                            @keydown.stop
                        >
                            {{ t('skills.progress.train') }}
                        </button>
                        <span v-else class="skill-training-time">
                            {{ formatTrainingTime(skill.trainingRemainingSeconds) }}
                        </span>
                    </template>
                    <template v-else-if="skill.progress">
                        <span class="skill-progress-rank skill-progress-rank--current skill-progress-rank--maximum">
                            {{ getSkillRankName(skill.rank) }}
                        </span>
                        <span class="skill-maximum-state">
                            {{ t('skills.progress.highestLevelFor') }}
                            <span :class="['skill-maximum-state-class', `skill-maximum-state-class--${gameClassKey}`]">
                                {{ gameClassName }}
                            </span>
                        </span>
                    </template>
                    <template v-else>
                        <span class="skill-progress-state">
                            {{ t('skills.progress.learnNovice') }}
                        </span>
                    </template>
                    </div>
                    <div
                        class="skill-details-wrapper"
                        :class="{ 'skill-details-wrapper--expanded': expandedSkillKey === skill.key }"
                        :aria-hidden="expandedSkillKey !== skill.key"
                    >
                        <div class="skill-details-clip">
                            <div :id="skillDetailsId(skill.key)" class="skill-details">
                                <div class="skill-detail-rank">
                                    <span class="skill-detail-label">{{ t('skills.details.currentRank') }}</span>
                                    <strong class="skill-detail-value">{{ getSkillRankName(skill.rank) }}</strong>
                                </div>
                                <div class="skill-detail-rank">
                                    <span class="skill-detail-label">{{ t('skills.details.classMaximumRank') }}</span>
                                    <strong class="skill-detail-value">{{ getSkillRankName(skill.cap) }}</strong>
                                </div>
                                <div class="skill-bonus-list">
                                    <div class="skill-bonus-row">
                                        <span
                                            class="skill-bonus-label"
                                            :class="{
                                                'skill-bonus-label--active': skill.skillBonusUnlocked,
                                                'skill-bonus-label--unknown': !skill.skillBonus,
                                            }"
                                        >{{ t('skills.bonuses.skillBonus') }}</span>
                                        <span v-if="skill.skillBonus" class="skill-bonus-value">
                                            <strong class="skill-bonus-value-emphasis">{{ skill.skillBonus.percentage }}</strong><span>{{ t(skill.skillBonus.effectTranslationKey) }}</span><strong v-if="skill.skillBonus.target" class="skill-bonus-value-emphasis">{{ skill.skillBonus.target }}</strong><span>{{ t(skill.skillBonus.perRankTranslationKey, { percent: skill.skillBonus.perRank, amount: skill.skillBonus.perRank }) }}</span>
                                        </span>
                                        <strong v-else class="skill-bonus-value skill-bonus-value--unknown">{{ unknownBonusLabel }}</strong>
                                    </div>
                                    <div class="skill-bonus-row">
                                        <span
                                            class="skill-bonus-label skill-bonus-label--unknown"
                                            :class="{ 'skill-bonus-label--active': skill.expertBonusUnlocked }"
                                        >{{ t('skills.bonuses.expertBonus') }}</span>
                                        <strong class="skill-bonus-value skill-bonus-value--unknown">{{ unknownBonusLabel }}</strong>
                                    </div>
                                    <div class="skill-bonus-row">
                                        <span
                                            class="skill-bonus-label skill-bonus-label--unknown"
                                            :class="{ 'skill-bonus-label--active': skill.masterBonusUnlocked }"
                                        >{{ t('skills.bonuses.masterBonus') }}</span>
                                        <strong class="skill-bonus-value skill-bonus-value--unknown">{{ unknownBonusLabel }}</strong>
                                    </div>
                                    <div class="skill-bonus-row">
                                        <span
                                            class="skill-bonus-label skill-bonus-label--unknown"
                                            :class="{ 'skill-bonus-label--active': skill.grandmasterBonusUnlocked }"
                                        >{{ t('skills.bonuses.grandmasterBonus') }}</span>
                                        <strong class="skill-bonus-value skill-bonus-value--unknown">{{ unknownBonusLabel }}</strong>
                                    </div>
                                </div>
                                <p class="skill-description">{{ t(skill.descriptionTranslationKey) }}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { MyPlayer } from '@/data/myPlayer'
import { useI18n } from '@/i18n'
import type {SkillKey, SkillProgressTO} from '@/network/messageIfs'
import {SkillDefinitions} from '@/data/skills/skillDefinitions'
import type {SkillCategoryKey, SkillDefinition} from '@/data/skills/skillDefinitions'
import { Connector } from '@/network/connector'
import { StartSkillTrainingMsg } from '@/network/messages'
import { AudioManager } from '@/babylon/audio/audioManager'

const { locale, t } = useI18n()
const myChar = MyPlayer.myCharRef
const expandedSkillKey = ref<SkillKey | null>(null)

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

const getSkillBonusValue = (skill: SkillDefinition, rank: number, progress?: SkillProgressTO) => {
    if (!skill.bonusKind) {
        return null
    }

    const armorBonus = skill.bonusKind === 'armor'
    const campingSetupSpeedBonus = skill.bonusKind === 'campingSetupSpeed'
    const bandageHealingBonus = skill.bonusKind === 'bandageHealing'
    const bonusPercent = campingSetupSpeedBonus
        ? progress?.actionSpeedBonusPercent
        : armorBonus ? progress?.armorBonusPercent : progress?.weaponAttackBonusPercent
    const bonusPercentPerRank = campingSetupSpeedBonus
        ? progress?.actionSpeedBonusPercentPerRank
        : armorBonus ? progress?.armorBonusPercentPerRank : progress?.weaponAttackBonusPercentPerRank
    return {
        percentage: bandageHealingBonus
            ? `${progress?.bandageHealingAmountMinimum ?? rank}–${progress?.bandageHealingAmountMaximum ?? rank * 2}`
            : `+${bonusPercent ?? rank * (campingSetupSpeedBonus ? 10 : 5)}%`,
        perRank: bandageHealingBonus
            ? `${progress?.bandageHealingAmountMinimumPerRank ?? 1}–${progress?.bandageHealingAmountMaximumPerRank ?? 2}`
            : bonusPercentPerRank ?? (campingSetupSpeedBonus ? 10 : 5),
        target: skill.bonusTargetTranslationKey ? t(skill.bonusTargetTranslationKey) : undefined,
        effectTranslationKey: bandageHealingBonus
            ? 'skills.bonuses.healedHealth'
            : campingSetupSpeedBonus
            ? 'skills.bonuses.fasterCampSetup'
            : armorBonus ? 'skills.bonuses.armorOfType' : 'skills.bonuses.weaponAttackOfType',
        perRankTranslationKey: bandageHealingBonus
            ? 'skills.bonuses.healedHealthPerRank'
            : 'skills.bonuses.bonusPerRank',
    }
}

const skills = computed(() => {
    const skillSet = myChar.value?.skillSet
    const skillCaps = myChar.value?.skillCaps ?? {}

    return SkillDefinitions.filter((skill) => skillCaps[skill.key] != null).map((skill) => {
        const progress = skillSet?.[skill.key]
        const rank = progress?.rank ?? 0

        return {
            ...skill,
            progress,
            key: skill.key,
            name: t(skill.translationKey),
            rank,
            skillBonus: getSkillBonusValue(skill, rank, progress),
            skillBonusUnlocked: !!skill.bonusKind && rank >= 1,
            expertBonusUnlocked: rank >= 4,
            masterBonusUnlocked: rank >= 7,
            grandmasterBonusUnlocked: rank >= 10,
            nextExperienceRequired: progress?.nextExperienceRequired,
            nextTrainingRequired: progress?.nextTrainingRequired,
            cap: skillCaps[skill.key] ?? 0,
            activeTraining: skillSet?.activeTrainingSkill === skill.key,
            needsExperience: progress?.nextTrainingRequired != null &&
                progress?.nextExperienceRequired != null &&
                progress.trainingPoints >= progress.nextTrainingRequired &&
                progress.experience < progress.nextExperienceRequired,
            experiencePercent: progress?.nextExperienceRequired
                ? Math.min(100, progress.experience / progress.nextExperienceRequired * 100)
                : 0,
            trainingPercent: progress?.nextTrainingRequired
                ? Math.min(100, progress.trainingPoints / progress.nextTrainingRequired * 100)
                : 0,
            trainingRemainingSeconds: progress?.nextTrainingRequired
                ? Math.max(0, Math.ceil((progress.nextTrainingRequired - progress.trainingPoints) /
                    (skillSet.trainingPointsPerSecond ?? 1)))
                : 0,
        }
    })
})

const skillCategoryOrder: SkillCategoryKey[] = ['weapons', 'armor', 'utility']
const visibleSkillCategories = computed(() => skillCategoryOrder
    .map((key) => ({key, skills: skills.value.filter((skill) => skill.category === key)}))
    .filter((category) => category.skills.length > 0))
const activeTrainingSkill = computed(() => skills.value.find((skill) => skill.activeTraining))
const skillDetailsId = (skill: SkillKey) => `skill-details-${skill}`
const toggleSkillDetails = (skill: SkillKey) => {
    expandedSkillKey.value = expandedSkillKey.value === skill ? null : skill
}

const insufficientExperienceLabel = computed(() => {
    const translationKey = 'skills.progress.insufficientExperience'
    const translatedLabel = t(translationKey)

    if (translatedLabel !== translationKey) {
        return translatedLabel
    }

    return locale.value === 'en' ? 'Insufficient experience' : 'Nedostatek zkušenosti'
})
const unknownBonusLabel = computed(() => t('skills.bonuses.unknown'))
const gameClassKey = computed(() => myChar.value?.gameClass?.key.toLowerCase() ?? '')
const gameClassName = computed(() => {
    const gameClass = myChar.value?.gameClass
    if (!gameClass) {
        return ''
    }

    const localizationKey = `classes.${gameClass.key.toLowerCase()}`
    const localizedName = t(localizationKey)
    return localizedName === localizationKey ? gameClass.name : localizedName
})

const getSkillRankName = (rank: number) => {
    const translationKey = skillRankTranslationKeys[rank]
    return translationKey ? t(translationKey) : t('skills.ranks.fallback', { rank })
}

const startTraining = (skill: SkillKey) => {
    AudioManager.playGuiButtonClick()
    Connector.sendMessage(new StartSkillTrainingMsg(skill))
}

const formatTrainingTime = (seconds: number) => {
    const minutes = Math.ceil(seconds / 60)
    const days = Math.floor(minutes / (24 * 60))
    const hours = Math.floor(minutes % (24 * 60) / 60)
    const remainingMinutes = minutes % 60
    const parts: string[] = []

    if (days > 0) parts.push(`${days}d`)
    if (hours > 0 || days > 0) parts.push(`${hours}h`)
    parts.push(`${remainingMinutes}m`)
    return parts.join(' ')
}
</script>

<style scoped>
.character-tab-panel {
    width: 100%;
    min-height: 100%;
}

.character-skills-tab {
    height: 100%;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 4px 8px 8px;
    box-sizing: border-box;
    color: rgb(var(--ui-base));
}

.active-training-summary {
    margin: 0 2px 11px;
    color: rgb(var(--ui-base));
    font-size: 0.92em;
    font-weight: 400;
    line-height: 1.2;
    text-align: left;
}

.active-training-summary-accent {
    margin: 0 0.5em;
    color: rgb(var(--ui-accent-blue));
    font-weight: 700;
    font-variant-numeric: tabular-nums;
}

.skill-category {
    min-width: 0;
}

.skill-category + .skill-category {
    margin-top: 10px;
}

.skill-category-title {
    margin: 0 0 5px;
    padding: 0 2px;
    color: rgb(var(--ui-base));
    font-size: clamp(13px, 1.8vh, 16px);
    font-weight: 700;
    line-height: 1.15;
}

.skill-list {
    overflow: hidden;
    border: 1px solid rgba(var(--ui-darker), 0.7);
    background: rgba(var(--ui-darker), 0.2);
}

.skill-row {
    border-bottom: 1px solid rgba(var(--ui-darker), 0.45);
    transition: box-shadow 220ms ease;
}

.skill-row-summary {
    display: grid;
    grid-template-columns: minmax(0, 22%) minmax(0, 112px) minmax(72px, min(150px, 20%)) minmax(0, 112px) max-content minmax(0, 1fr);
    align-items: center;
    column-gap: 8px;
    min-height: 35px;
    padding: 5px 9px 5px 11px;
    box-sizing: border-box;
    cursor: url('/images/cursor-pointer.png'), pointer;
}

.skill-row:last-child {
    border-bottom: 0;
}

.skill-row--expanded {
    --skill-row-expanded-left-accent: rgba(var(--ui-accent-blue), 0.78);
    box-shadow:
        inset 3px 0 0 var(--skill-row-expanded-left-accent),
        inset 0 0 0 1px rgba(var(--ui-accent-blue), 0.24),
        inset 0 0 14px rgba(var(--ui-accent-blue), 0.16);
}

.skill-row--expanded .skill-name {
    color: rgb(var(--ui-accent-blue));
}

.skill-row--untrained .skill-name,
.skill-row--untrained .skill-progress-state {
    color: rgb(var(--ui-darker));
}

.skill-row--untrained .skill-name {
    font-weight: 400;
}

.skill-row--active-training {
    animation: skill-training-glow 2.2s ease-in-out infinite;
    box-shadow:
        inset 3px 0 0 var(--skill-row-expanded-left-accent, transparent),
        inset 0 0 0 1px rgba(var(--ui-accent-blue), 0.42),
        inset 0 0 20px rgba(var(--ui-accent-blue), 0.35);
}

.skill-name {
    flex: 0 1 22%;
    justify-self: start;
    min-width: 0;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    font-weight: 700;
    white-space: nowrap;
}

.skill-progress-stack {
    display: flex;
    flex: 0 1 clamp(72px, 18vw, 150px);
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}

.skill-progress-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

.skill-progress-state {
    color: rgb(var(--ui-dark));
    font-size: 0.78em;
    white-space: nowrap;
}

.skill-progress-track {
    flex: 1 1 auto;
    min-width: 24px;
    height: 6px;
    overflow: hidden;
    border: 1px solid rgba(var(--ui-darkest), 0.5);
    background: rgb(var(--ui-darkest));
}

.skill-progress-fill {
    display: block;
    height: 100%;
}

.skill-progress-fill--experience {
    background: linear-gradient(to bottom, rgb(var(--ui-success)), rgb(var(--ui-progress-experience-dark)));
}

.skill-progress-fill--training {
    width: 0;
    background: linear-gradient(to bottom, rgb(var(--ui-progress-training-light)), rgb(var(--ui-progress-training-dark)));
}

.skill-progress-state {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-align: right;
    text-overflow: ellipsis;
}

.skill-progress-rank,
.skill-training-button,
.skill-training-time {
    flex: 0 0 auto;
    font-weight: 700;
    white-space: nowrap;
}

.skill-progress-rank {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}

.skill-progress-rank--current,
.skill-progress-rank--next {
    color: rgb(var(--ui-dark));
    font-weight: 400;
}

.skill-progress-rank--current {
    text-align: right;
}

.skill-progress-rank--next {
    text-align: left;
}

.skill-row--active-training .skill-progress-rank--next {
    color: rgb(var(--ui-accent-blue));
}

.skill-experience-shortage {
    grid-column: 5 / -1;
    color: rgb(var(--ui-danger));
    font-size: 0.85em;
    font-weight: 700;
    line-height: 1.1;
    text-align: right;
    white-space: normal;
}

.skill-progress-rank--maximum {
    color: rgb(var(--ui-accent-blue));
}

.skill-maximum-state {
    grid-column: 3 / -1;
    min-width: 0;
    overflow: hidden;
    color: rgb(var(--ui-dark));
    font-weight: 400;
    text-overflow: ellipsis;
    text-align: right;
    white-space: nowrap;
}

.skill-maximum-state-class {
    margin-left: 0.25em;
    font-weight: 700;
}

.skill-maximum-state-class--fighter {
    color: rgb(var(--ui-accent-red));
}

.skill-maximum-state-class--adept {
    color: rgb(var(--ui-accent-purple));
}

.skill-maximum-state-class--gm {
    color: rgb(var(--ui-base));
}

.skill-training-button {
    padding: 2px 7px;
    border-radius: 0;
    font: inherit;
    font-size: 1.15em;
    font-weight: 700;
    line-height: 1.15;
    text-transform: none;
}

.skill-training-time {
    margin-left: 4px;
    color: rgb(var(--ui-accent-blue));
    font-size: 1em;
    font-weight: inherit;
    font-variant-numeric: tabular-nums;
}

.skill-row--untrained .skill-progress-state {
    grid-column: 2 / -1;
    font-size: 1em;
}

.skill-details-wrapper {
    display: grid;
    grid-template-rows: 0fr;
    overflow: hidden;
    transition: grid-template-rows 280ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.skill-details-wrapper--expanded {
    grid-template-rows: 1fr;
}

.skill-details-clip {
    min-height: 0;
    overflow: hidden;
}

.skill-details {
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr);
    column-gap: 24px;
    row-gap: 4px;
    margin: 7px 9px 1px 11px;
    min-height: 0;
    opacity: 0;
    padding: 0 0 4px;
    transform: translateY(-4px);
    transition: opacity 150ms ease, transform 280ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.skill-details-wrapper--expanded .skill-details {
    opacity: 1;
    transform: translateY(0);
    transition-delay: 70ms, 0s;
}

.skill-detail-rank {
    display: flex;
    align-items: baseline;
    gap: 0.4em;
}

.skill-detail-label {
    color: rgb(var(--ui-dark));
}

.skill-detail-value {
    color: rgb(var(--ui-base));
    font-weight: 700;
}

.skill-bonus-list {
    display: contents;
}

.skill-bonus-row {
    display: contents;
}

.skill-bonus-row:first-child .skill-bonus-label,
.skill-bonus-row:first-child .skill-bonus-value {
    margin-top: 4px;
}

.skill-bonus-label {
    grid-column: 1;
    color: rgb(var(--ui-dark));
    text-align: left;
}

.skill-bonus-label--active,
.skill-bonus-value-emphasis {
    color: rgb(var(--ui-success));
}

.skill-bonus-value {
    grid-column: 2;
    color: rgb(var(--ui-base));
    font-weight: 400;
    text-align: left;
}

.skill-bonus-value-emphasis {
    display: inline-block;
    margin-inline: 0.3em;
    font-weight: 700;
}

.skill-bonus-value-emphasis:first-child {
    margin-left: 0;
}

.skill-bonus-value--unknown {
    color: rgb(var(--ui-dark));
    font-size: 1em;
    font-weight: 400;
}

.skill-bonus-label--unknown:not(.skill-bonus-label--active),
.skill-bonus-value--unknown {
    color: rgb(var(--ui-darker));
}

.skill-description {
    grid-column: 1 / -1;
    margin: 6px 0 0;
    color: rgb(var(--ui-dark));
    font-style: italic;
    font-weight: 400;
    line-height: 1.3;
    text-align: left;
}

@keyframes skill-training-glow {
    50% {
        box-shadow:
        inset 3px 0 0 var(--skill-row-expanded-left-accent, transparent),
        inset 0 0 0 1px rgba(var(--ui-accent-blue), 0.68),
        inset 0 0 28px rgba(var(--ui-accent-blue), 0.56);
    }
}

@media (max-height: 600px) and (min-aspect-ratio: 8 / 5) {
    .skill-list {
        font-size: 0.88em;
    }

    .skill-row-summary {
        grid-template-columns: minmax(0, 20%) minmax(0, 1fr) minmax(64px, 20%) minmax(0, 1fr) 76px minmax(0, 1fr);
        column-gap: 4px;
    }

    .skill-training-button,
    .skill-training-time {
        justify-self: end;
    }
}

@media (max-width: 600px) {
    .skill-name {
        flex-basis: 24%;
    }
}

@media (max-width: 460px) {
    .skill-row-summary {
        grid-template-columns: minmax(0, 20%) minmax(0, 1fr) minmax(56px, 20%) minmax(0, 1fr) 76px minmax(0, 1fr);
        column-gap: 4px;
        padding-right: 7px;
        padding-left: 9px;
    }

    .skill-name {
        flex-basis: 22%;
    }

    .skill-training-button,
    .skill-training-time {
        justify-self: end;
    }

    .skill-training-button {
        font-size: 1.05em;
    }

    .skill-training-time {
        font-size: 0.72em;
    }

    .skill-details {
        grid-template-columns: minmax(140px, 44%) minmax(0, 1fr);
        column-gap: 12px;
        row-gap: 4px;
    }
}

@media (prefers-reduced-motion: reduce) {
    .skill-row,
    .skill-details-wrapper,
    .skill-details {
        transition: none;
    }
}
</style>
