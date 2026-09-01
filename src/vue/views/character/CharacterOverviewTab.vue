<template>
    <div class="character-tab-panel">
        <div class="character-overview-header">
            <div class="character-overview-name">
                {{ characterTitle }}
            </div>
            <div class="character-overview-attributes">
                <section
                    v-for="attribute in attributes"
                    :key="attribute.key"
                    :class="['character-overview-attribute', `character-overview-attribute--${attribute.key}`]"
                >
                    <div class="character-overview-attribute-base">
                        <span class="character-overview-attribute-label">{{ attribute.label }}</span>
                        <span class="character-overview-attribute-value">{{ attribute.value }}</span>
                    </div>
                    <div v-if="attribute.stats.length" class="character-overview-derived-stats">
                        <div v-for="stat in attribute.stats" :key="stat.key" class="character-overview-derived-stat">
                            <span class="character-overview-derived-label">{{ stat.label }}</span>
                            <span class="character-overview-derived-value">{{ stat.value }}</span>
                        </div>
                    </div>
                    <div v-else class="character-overview-derived-placeholder"></div>
                </section>
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

const autoAttackCooldownSeconds = computed(() => (MyCombatData.aaCd / 1000).toFixed(2))
const damageTypeLabels: Record<string, string> = {
    PHYSICAL_SLASH: 'vendor.damageSlash',
    PHYSICAL_PIERCE: 'vendor.damagePierce',
    PHYSICAL_BLUNT: 'vendor.damageBlunt',
}

const equippedWeaponDamageType = computed(() => {
    const damageTypes = myChar.value?.getWeapon()?.damageTypes ?? []

    return damageTypes.length
        ? damageTypes.map((type) => t(damageTypeLabels[type] ?? type)).join(' / ')
        : null
})

const attributes = computed(() => [
    {
        key: 'str',
        label: t('character.strength'),
        value: MyCombatData.str,
        stats: [
            {
                key: 'physicalAttack',
                label: t('vendor.attack'),
                value: MyCombatData.patk,
            },
            { key: 'damageType', label: t('vendor.attackType'), value: equippedWeaponDamageType.value ?? '-' },
            { key: 'attackSpeed', label: t('vendor.speed'), value: `${autoAttackCooldownSeconds.value}s` },
        ],
    },
    {
        key: 'agi',
        label: t('character.agility'),
        value: MyCombatData.agi,
        stats: [
            { key: 'physicalDefense', label: t('character.physicalDefense'), value: MyCombatData.armor },
            { key: 'precision', label: t('character.precision'), value: MyCombatData.precision },
            { key: 'defense', label: t('character.defense'), value: MyCombatData.defense },
        ],
    },
    {
        key: 'int',
        label: t('character.intelligence'),
        value: MyCombatData.int,
        stats: [
            { key: 'interference', label: t('character.interference'), value: `${MyCombatData.arcaneInterference}%` },
        ],
    },
    {
        key: 'wis',
        label: t('character.wisdom'),
        value: MyCombatData.wis,
        stats: [],
    },
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
    gap: 7px;
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

.character-overview-attributes {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 7px;
}

.character-overview-attribute {
    --character-attribute-accent: var(--ui-base);

    min-width: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(var(--ui-darker), 0.7);
    background: rgba(var(--ui-darker), 0.2);
    box-shadow: inset 0 2px 0 rgba(var(--character-attribute-accent), 0.7);
}

.character-overview-attribute--str {
    --character-attribute-accent: 204, 123, 108;
}

.character-overview-attribute--agi {
    --character-attribute-accent: 119, 171, 125;
}

.character-overview-attribute--int {
    --character-attribute-accent: 164, 132, 193;
}

.character-overview-attribute--wis {
    --character-attribute-accent: 108, 155, 193;
}

.character-overview-attribute-base {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 7px 5px 6px;
    border-bottom: 1px solid rgba(var(--ui-darker), 0.55);
}

.character-overview-attribute-label,
.character-overview-derived-label {
    color: rgb(var(--ui-dark));
}

.character-overview-attribute-label {
    overflow: hidden;
    font-size: clamp(10px, 1.45vh, 13px);
    line-height: 1.15;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.character-overview-attribute-value {
    color: rgb(var(--character-attribute-accent));
    font-size: clamp(19px, 3vh, 28px);
    font-weight: 700;
    line-height: 1;
}

.character-overview-derived-stats {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 7px 7px 8px;
}

.character-overview-derived-placeholder {
    flex: 1 1 auto;
    min-height: 56px;
}

.character-overview-derived-stat {
    min-width: 0;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 5px;
    font-size: clamp(10px, 1.35vh, 12px);
    line-height: 1.2;
}

.character-overview-derived-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.character-overview-derived-value {
    flex: 0 0 auto;
    color: rgb(var(--ui-base));
    font-weight: 700;
    white-space: nowrap;
}

@media (max-width: 500px) {
    .character-overview-attributes {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
