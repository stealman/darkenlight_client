<template>
    <div class="character-tab-panel character-skills-tab">
        <section class="skill-category">
            <h3 class="skill-category-title">{{ t('skills.categories.combat') }}</h3>
            <div class="skill-list">
                <div v-for="skill in combatSkills" :key="skill.key" class="skill-row">
                    <span class="skill-name">{{ skill.name }}</span>
                    <span class="skill-rank">{{ getSkillRankName(skill.rank) }}</span>
                </div>
            </div>
        </section>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MyPlayer } from '@/data/myPlayer'
import { useI18n } from '@/i18n'
import type { SkillSetTO } from '@/network/messageIfs'

const { t } = useI18n()
const myChar = MyPlayer.myCharRef

const combatSkillDefinitions: Array<{ key: keyof SkillSetTO, translationKey: string }> = [
    { key: 'swords', translationKey: 'skills.weapons.swords' },
    { key: 'axes', translationKey: 'skills.weapons.axes' },
    { key: 'maces', translationKey: 'skills.weapons.maces' },
    { key: 'polearms', translationKey: 'skills.weapons.polearms' },
    { key: 'daggers', translationKey: 'skills.weapons.daggers' },
    { key: 'bows', translationKey: 'skills.weapons.bows' },
]

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

const combatSkills = computed(() => {
    const skillSet = myChar.value?.skillSet

    return combatSkillDefinitions.map((skill) => ({
        key: skill.key,
        name: t(skill.translationKey),
        rank: skillSet?.[skill.key] ?? 0,
    }))
})

const getSkillRankName = (rank: number) => {
    const translationKey = skillRankTranslationKeys[rank]
    return translationKey ? t(translationKey) : t('skills.ranks.fallback', { rank })
}
</script>

<style scoped>
.character-tab-panel {
    width: 100%;
    min-height: 100%;
}

.character-skills-tab {
    padding: 4px 8px 8px;
    box-sizing: border-box;
    color: rgb(var(--ui-base));
}

.skill-category {
    overflow: hidden;
    border: 1px solid rgba(var(--ui-darker), 0.7);
    background: rgba(var(--ui-darker), 0.2);
}

.skill-category-title {
    margin: 0;
    padding: 7px 9px;
    border-bottom: 1px solid rgba(var(--ui-darker), 0.7);
    color: rgb(var(--ui-base));
    font-size: clamp(13px, 1.8vh, 16px);
    font-weight: 700;
    line-height: 1.15;
}

.skill-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 35px;
    padding: 5px 9px;
    border-bottom: 1px solid rgba(var(--ui-darker), 0.45);
    box-sizing: border-box;
}

.skill-row:last-child {
    border-bottom: 0;
}

.skill-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.skill-rank {
    flex: 0 0 auto;
    color: rgb(var(--ui-dark));
    font-weight: 700;
    white-space: nowrap;
}
</style>
