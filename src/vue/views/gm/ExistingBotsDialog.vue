<template>
    <GameDialog
        v-if="dialogVisible"
        window-class="adaptive existing-bots-dialog-window"
        content-class="existing-bots-dialog-content"
        @close="closeDialog"
    >
        <template #header>Existing Bots</template>

        <div class="existing-bots-summary">
            <span>{{ bots.length }} bot{{ bots.length === 1 ? '' : 's' }}</span>
            <span>Live refresh: 1 s</span>
            <span v-if="updatedAt">Updated {{ formatTime(updatedAt) }}</span>
        </div>

        <div class="existing-bots-table-wrap">
            <table class="existing-bots-table">
                <thead>
                    <tr>
                        <th>Bot</th>
                        <th>Location</th>
                        <th>State &amp; objective</th>
                        <th>Vitals &amp; supplies</th>
                        <th>Navigation</th>
                        <th>Memory &amp; home</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="bots.length === 0">
                        <td colspan="6" class="existing-bots-empty">No runtime bots.</td>
                    </tr>
                    <tr v-for="bot in bots" :key="bot.id">
                        <td>
                            <strong>{{ bot.name }}</strong>
                            <small>#{{ bot.id }} · {{ bot.className }}</small>
                            <span :class="['bot-status', bot.alive && bot.controllerActive ? 'bot-status--ok' : 'bot-status--warning']">
                                {{ bot.alive ? (bot.controllerActive ? 'ALIVE' : 'CONTROLLER STOPPED') : 'DEAD' }}
                            </span>
                            <small v-if="!bot.alive">Respawn {{ bot.respawnInSeconds ?? '?' }} s</small>
                        </td>
                        <td>
                            <strong>{{ bot.world.name || 'World' }} #{{ bot.world.id }}</strong>
                            <span>{{ point3(bot.position) }}</span>
                            <small v-if="bot.origin">Origin W{{ bot.origin.worldId }} {{ bot.origin.x }}/{{ bot.origin.z }}</small>
                        </td>
                        <td>
                            <strong>{{ bot.state }}</strong>
                            <span>Action: {{ bot.action || 'none' }}</span>
                            <span>Goal: {{ bot.plan?.goal || 'none' }}</span>
                            <small v-if="bot.plan?.spawn">Spawn #{{ bot.plan.spawn.id }} at {{ point(bot.plan.spawn) }}</small>
                            <small v-if="bot.plan?.monster">Target {{ bot.plan.monster.name }} #{{ bot.plan.monster.id }} at {{ point(bot.plan.monster) }}</small>
                            <small v-if="bot.plan?.retreatDestination">Retreat to {{ point(bot.plan.retreatDestination) }}</small>
                            <small v-if="bot.plan?.remainingSeconds">Plan {{ duration(bot.plan.remainingSeconds) }}</small>
                        </td>
                        <td>
                            <span>HP {{ value(bot.vitals.hp) }}/{{ value(bot.vitals.maxHp) }} ({{ percent(bot.vitals.hp, bot.vitals.maxHp) }}%) · ST {{ value(bot.vitals.stamina) }}/{{ value(bot.vitals.maxStamina) }} ({{ percent(bot.vitals.stamina, bot.vitals.maxStamina) }}%)</span>
                            <span v-if="bot.vitals.maxMp > 0">MP {{ value(bot.vitals.mp) }}/{{ value(bot.vitals.maxMp) }}</span>
                            <small>{{ bot.vitals.tired ? 'Tired' : 'Not tired' }}</small>
                            <small>Bandages {{ bot.supplies?.bandages ?? '?' }} · Emeralds {{ bot.supplies?.emeralds ?? '?' }}</small>
                            <small v-if="bot.equipment?.length">Gear: {{ equipment(bot.equipment) }}</small>
                        </td>
                        <td>
                            <strong>{{ bot.navigation?.purpose || 'idle' }}</strong>
                            <span>Move: {{ bot.movement?.type || 'stopped' }} · {{ value(bot.movement?.speed ?? 0) }}</span>
                            <small v-if="bot.navigation?.destination">Destination {{ point(bot.navigation.destination) }}</small>
                            <small v-if="bot.navigation?.waypoint">Waypoint {{ point(bot.navigation.waypoint) }}</small>
                            <small v-if="bot.movement?.target">Server target {{ point(bot.movement.target) }} (+{{ bot.movement.queuedWaypoints }})</small>
                            <small v-if="bot.navigation?.backtrackTarget">Backtrack {{ point(bot.navigation.backtrackTarget) }}</small>
                            <small>Failed plans {{ bot.navigation?.failedPlans ?? 0 }} · trail {{ bot.navigation?.trailPoints ?? 0 }}</small>
                            <small v-if="bot.journey">Journey {{ bot.journey.from }} → {{ bot.journey.to }} ({{ bot.journey.breadcrumbs }})</small>
                        </td>
                        <td>
                            <span>Routes {{ bot.memory?.routes ?? 0 }} · links {{ bot.memory?.spawnLinks ?? 0 }}</span>
                            <small>Healer {{ bot.home?.healerId ?? 'none' }}</small>
                            <small>Guard safe {{ bot.home?.guardSafePoint ? point(bot.home.guardSafePoint) : 'none' }}</small>
                            <small>Fireplace {{ bot.home?.fireplace ? point(bot.home.fireplace) : 'none' }}</small>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="dialog-actions existing-bots-actions">
            <button class="dialog-button" @click="requestNow"><span class="ui-text-gradient--button-state">Refresh</span></button>
            <button class="dialog-button" @click="closeDialog"><span class="ui-text-gradient--button-state">Close</span></button>
        </div>
    </GameDialog>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import type { GMBotStatusData } from '@/network/messageIfs'
import { GMManager } from '@/gm/GM'
import GameDialog from '@/vue/views/GameDialog.vue'

const dialogVisible = ref(false)
const bots = GMManager.botStatuses
const updatedAt = GMManager.botStatusesUpdatedAt
let refreshTimer: number | null = null

const requestNow = () => GMManager.requestBotStatuses()

const stopRefreshing = () => {
    if (refreshTimer === null) return
    window.clearInterval(refreshTimer)
    refreshTimer = null
}

const openDialog = () => {
    if (dialogVisible.value) return
    dialogVisible.value = true
    requestNow()
    refreshTimer = window.setInterval(requestNow, 1000)
}

const closeDialog = () => {
    dialogVisible.value = false
    stopRefreshing()
}

const value = (input: number) => Math.round(input * 10) / 10
const percent = (current: number, maximum: number) => maximum > 0 ? Math.round(current / maximum * 100) : 0
const point = (position: {x: number, z: number}) => `${Math.round(position.x)}/${Math.round(position.z)}`
const point3 = (position: {x: number, y: number, z: number}) => `${Math.round(position.x)} / ${Math.round(position.y)} / ${Math.round(position.z)}`
const duration = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`
const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString()
const equipment = (items: NonNullable<GMBotStatusData['equipment']>) => items
    .map((item) => `${item.slot}: ${item.name}${item.durability === null ? '' : ` ${item.durability}/${item.maxDurability}`}`)
    .join(', ')

onUnmounted(stopRefreshing)
defineExpose({openDialog, closeDialog})
</script>

<style scoped>
:deep(.existing-bots-dialog-window) {
    width: min(1420px, 96vw);
    max-width: 96vw;
    max-height: 88vh;
}

:deep(.existing-bots-dialog-content) {
    box-sizing: border-box;
    padding: 8px 10px 12px;
}

.existing-bots-summary {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
    color: rgb(var(--ui-dark));
}

.existing-bots-table-wrap {
    max-height: 68vh;
    overflow: auto;
    border: 1px solid rgba(var(--ui-dark), 0.45);
}

.existing-bots-table {
    width: 100%;
    min-width: 1180px;
    border-collapse: collapse;
    text-align: left;
}

.existing-bots-table th,
.existing-bots-table td {
    padding: 7px 8px;
    border-right: 1px solid rgba(var(--ui-dark), 0.2);
    border-bottom: 1px solid rgba(var(--ui-dark), 0.28);
    vertical-align: top;
}

.existing-bots-table th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: rgb(var(--ui-darkest));
    color: rgb(var(--ui-base));
}

.existing-bots-table td > span,
.existing-bots-table td > small,
.existing-bots-table td > strong {
    display: block;
}

.existing-bots-table small {
    color: rgb(var(--ui-dark));
}

.bot-status {
    margin: 4px 0;
    font-size: 0.72rem;
    font-weight: bold;
}

.bot-status--ok {
    color: rgb(var(--ui-success));
}

.bot-status--warning {
    color: rgb(var(--ui-danger));
}

.existing-bots-empty {
    padding: 24px !important;
    text-align: center;
    color: rgb(var(--ui-dark));
}

.existing-bots-actions {
    margin-top: 10px;
}
</style>
