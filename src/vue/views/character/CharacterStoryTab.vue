<template>
    <section class="story-panel" @keydown.stop @keyup.stop @pointerdown.stop @wheel.stop>
        <nav class="story-tabs" role="tablist" :aria-label="t('character.tabs.story')">
            <button type="button" role="tab" aria-selected="true" aria-controls="story-log" id="story-log-tab"><span class="ui-text-gradient ui-text-gradient--no-shadow">LOG</span></button>
        </nav>
        <div id="story-log" ref="log" class="story-log" role="log" aria-labelledby="story-log-tab" @scroll="onScroll">
            <div v-if="!activityEntries.length" class="story-empty">{{ t('activityLog.empty') }}</div>
            <div v-for="entry in activityEntries" :key="entry.id" class="activity-entry" :class="{'activity-entry--negative': entry.negative, 'activity-entry--positive': entry.positive, 'activity-entry--kill': !!entry.kill}" :title="new Date(entry.time).toLocaleString()"><template v-if="entry.kill">{{ entry.kill.before }}<span class="activity-kill-name" :style="{color: entry.kill.color}">{{ entry.kill.name }}</span>{{ entry.kill.after }}</template><template v-else-if="entry.damage">{{ entry.damage.before }}<span :style="{color: entry.color}">{{ entry.damage.heightBlocks ? entry.damage.value.slice(0, -getDamageHeightSuffix(entry.damage.heightBlocks).length) : entry.damage.value }}<span v-if="entry.damage.heightBlocks" :style="{color: `rgb(var(${getHeightColorToken(entry.damage.heightBlocks)}))`}">{{ getDamageHeightSuffix(entry.damage.heightBlocks) }}</span></span>{{ entry.damage.after }}</template><template v-else-if="entry.item">{{ entry.item.before }}<strong class="activity-item-name">{{ entry.item.name }}{{ entry.item.after }}</strong></template><template v-else>{{ entry.text }}</template></div>
        </div>
    </section>
</template>

<script setup lang="ts">
import {computed, nextTick, onMounted, ref, watch} from 'vue'
import {ActivityLogManager} from '@/data/activityLogManager'
import {getDamageHeightSuffix, getHeightColorToken} from '@/gui/combatText'
import {useI18n} from '@/i18n'
const {t} = useI18n()
const props = defineProps<{visible?: boolean}>()
const activityEntries = computed(() => ActivityLogManager.state.entries)
const log = ref<HTMLElement | null>(null)
let stickToBottom = true
function scrollBottom() { nextTick(() => { if (log.value) log.value.scrollTop = log.value.scrollHeight }) }
function onScroll() { const el = log.value; if (el) stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40 }
watch(() => activityEntries.value.at(-1)?.id, () => { if (stickToBottom) scrollBottom() })
watch(() => props.visible, visible => { if (visible && stickToBottom) scrollBottom() })
onMounted(scrollBottom)
</script>

<style scoped>
.story-panel { width: 100%; min-height: 0; display: flex; flex-direction: column; margin: 12px; overflow: hidden; color: rgb(var(--ui-base)); border: 1px solid rgba(var(--ui-base), .15); border-radius: 8px; background: rgba(var(--ui-darkest), .3); }
.story-tabs { display: flex; flex-shrink: 0; }
.story-tabs button { flex: 1; font: inherit; font-size: .75rem; font-weight: 700; border: 0; padding: 6px 12px; color: inherit; background: rgba(var(--ui-base), .16); cursor: var(--ui-cursor-pointer); }
.story-log { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 8px 12px; text-align: left; font-weight: 200; text-shadow: none; font-synthesis: none; }
.story-empty { opacity: .55; padding: 32px 10px; font-size: 13px; }
.activity-entry { padding: 3px 6px; white-space: pre-wrap; overflow-wrap: anywhere; border-bottom: 1px solid rgba(var(--ui-base), .06); font-size: 13px; line-height: 1.4; }
.activity-entry--kill, .activity-item-name { font-weight: 700; }
.activity-kill-name { color: rgb(var(--ui-item-special-stat)); }
.activity-entry--positive { color: rgb(var(--ui-success)); }
.activity-entry--negative { background: rgba(var(--ui-danger), .1); }
@media (max-width: 600px) {
    .story-panel { margin: 6px; }
    .story-log { padding: 4px 8px; }
    .story-empty { padding: 12px 6px; }
}
</style>
