<template>
    <div class="area-announcement" role="status" aria-live="polite" aria-atomic="true">
        <div v-if="announcement" :key="announcement.sequence" class="area-announcement-name"
            :data-sequence="announcement.sequence" @animationend="dismiss">
            <span class="ui-text-gradient ui-text-gradient--no-shadow">{{ announcement.name }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { WorldAreaManager } from '@/data/worldAreaManager'

WorldAreaManager.resetLocation()
const announcement = ref<{name: string, sequence: number} | null>(null)
watch(WorldAreaManager.announcement, value => { announcement.value = value })
const dismiss = (event: AnimationEvent) => {
    if ((event.currentTarget as HTMLElement).dataset.sequence === String(announcement.value?.sequence)) announcement.value = null
}
onUnmounted(() => WorldAreaManager.resetLocation())
</script>

<style scoped>
.area-announcement {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 100;
}
.area-announcement-name {
    position: relative;
    max-width: min(80vw, 800px);
    box-sizing: border-box;
    padding: 0 30px 12px;
    color: rgb(var(--ui-base));
    font-size: clamp(24px, 3.2vw, 42px);
    font-weight: 500;
    text-align: center;
    overflow-wrap: anywhere;
    text-shadow: 0 1px 3px rgb(var(--ui-darkest));
    animation: area-announcement 2.7s ease-out both;
}
.area-announcement-name > .ui-text-gradient {
    -webkit-text-stroke: 0.5px var(--ui-field-border);
    paint-order: stroke fill;
}
.area-announcement-name::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    border-style: solid;
    border-color: transparent;
    border-width: 0 0 8px;
    border-image: var(--gui-panel) 24 / 0 0 8px 0 / 0 stretch;
    opacity: 0.4;
}
@keyframes area-announcement {
    0% { opacity: 0; }
    8%, 74.074% { opacity: 1; }
    100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
    @keyframes area-announcement {
        0%, 74.074% { opacity: 1; }
        100% { opacity: 0; }
    }
}
</style>
