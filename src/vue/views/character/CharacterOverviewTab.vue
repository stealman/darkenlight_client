<template>
    <div class="character-tab-panel">
        <div class="character-overview-header">
            <div class="character-overview-name">
                {{ characterTitle }}
            </div>
            <div class="character-overview-stats">
                <div v-for="stat in stats" :key="stat.key" class="character-overview-stat">
                    <span class="character-overview-stat-label">{{ stat.label }}</span>
                    <span class="character-overview-stat-value">{{ stat.value }}</span>
                </div>
            </div>
            <div class="character-overview-combat-stats">
                <div v-for="stat in combatStats" :key="stat.key" class="character-overview-combat-stat">
                    <span class="character-overview-stat-label">{{ stat.label }}</span>
                    <span class="character-overview-stat-value">{{ stat.value }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MyPlayer } from '@/data/myPlayer'
import { MyCombatData } from '@/data/myCombatData'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const myChar = MyPlayer.myCharRef

const characterTitle = computed(() => {
    const name = myChar.value?.name ?? ''
    const gameClassName = myChar.value?.gameClass?.name ?? ''

    return gameClassName ? `${name} (${gameClassName})` : name
})

const stats = computed(() => [
    { key: 'str', label: t('character.strength'), value: MyCombatData.str },
    { key: 'agi', label: t('character.agility'), value: MyCombatData.agi },
    { key: 'int', label: t('character.intelligence'), value: MyCombatData.int },
    { key: 'wis', label: t('character.wisdom'), value: MyCombatData.wis },
])

const autoAttackCooldownSeconds = computed(() => (MyCombatData.aaCd / 1000).toFixed(2))

const combatStats = computed(() => [
    { key: 'physicalAttack', label: t('character.physicalAttack'), value: `${MyCombatData.patk} (${autoAttackCooldownSeconds.value}s)` },
    { key: 'physicalDefense', label: t('character.physicalDefense'), value: '-' },
])
</script>

<style scoped>
.character-tab-panel {
    width: 100%;
    min-height: 100%;
    color: rgb(var(--ui-base));
}

.character-overview-header {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 4px 8px 8px;
    box-sizing: border-box;
}

.character-overview-name {
    max-width: 100%;
    font-size: clamp(15px, 2.1vh, 19px);
    font-weight: 700;
    line-height: 1.15;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.character-overview-stats {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    margin-bottom: 4px;
}

.character-overview-combat-stats {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.character-overview-stat,
.character-overview-stat,
.character-overview-combat-stat {
    min-width: 0;
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 4px;
    color: rgb(var(--ui-base));
    font-size: clamp(10px, 1.45vh, 13px);
    line-height: 1.2;
    white-space: nowrap;
}

.character-overview-stat,
.character-overview-combat-stat {
    justify-content: flex-start;
}

.character-overview-stat-label {
    overflow: hidden;
    text-overflow: ellipsis;
}

.character-overview-stat-value {
    flex: 0 0 auto;
    font-weight: 700;
}
</style>
