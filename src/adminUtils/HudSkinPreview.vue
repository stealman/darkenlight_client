<template>
    <section class="hud-skin-preview" :style="{ '--preview-action-size': small ? '40px' : '64px' }">
        <p class="hud-skin-preview-copy">Offline náhled rámů · běžné tlačítko, přepnutá akce, cooldown a nedostupná akce. Ilustrační obsah minimapy.</p>
        <canvas ref="map" id="miniMapCanvas" width="160" height="160" aria-label="Náhled minimapy"></canvas>
        <div id="gui-buttons">
            <div id="btn-backpack" class="gui-action-button"><img class="action-icon" src="/images/icons/buttons/btn_backpack.png" alt="Inventář"></div>
            <div id="btn-character" class="gui-action-button"><img class="action-icon" src="/images/icons/buttons/btn_char.png" alt="Postava"></div>
        </div>
        <div id="opportunity-action-buttons">
            <div v-for="icon in ['btn_pickaxe', 'btn_chat']" :key="icon" class="gui-action-button"><img class="action-icon" :src="`/images/icons/buttons/${icon}.png`" :alt="icon"></div>
        </div>
        <div id="action-buttons-1">
            <div v-for="(icon, index) in icons" :key="icon" class="action-button" :class="{ toggled: index === 1, 'cooldown-active': index === 2, unavailable: index === 3 }">
                <img :src="`/images/icons/buttons/${icon}.png`" class="action-icon" :alt="icon">
                <div v-if="index === 2" class="action-button-cooldown-overlay" style="--cooldown-progress: 35"></div>
            </div>
        </div>
        <div id="action-buttons-2">
            <div v-for="icon in icons.slice(0, 3)" :key="icon" class="action-button"><img :src="`/images/icons/buttons/${icon}.png`" class="action-icon" :alt="icon"></div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
defineProps<{ small: boolean }>()
const map = ref<HTMLCanvasElement | null>(null)
const icons = ['btn_attack_sword', 'btn_heal', 'btn_heal_potion', 'btn_attack_ranged', 'btn_camp']
onMounted(() => {
    const ctx = map.value?.getContext('2d')
    if (!ctx) return
    for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
            ctx.fillStyle = x > 24 ? '#525f67' : (Math.sin(x * .3) + Math.cos(y * .4)) > .6 ? '#526257' : '#a5ada8'
            ctx.fillRect(x * 4, y * 4, 4, 4)
        }
    }
    ctx.fillStyle = '#e6c07f'
    ctx.fillRect(77, 77, 6, 6)
})
</script>

<style>
.hud-skin-preview { position: relative; width: min(700px, calc(100% - 32px)); height: min(580px, calc(100dvh - 100px)); min-height: 410px; margin: 16px auto; }
.hud-skin-preview-copy { max-width: 340px; color: rgb(var(--ui-base)); font-size: 13px; line-height: 1.7; }
.hud-skin-preview #miniMapCanvas { top: 0; right: 0; width: 160px; height: 160px; }
.hud-skin-preview #action-buttons-1 { bottom: 0; right: 0; }
.hud-skin-preview #action-buttons-2 { bottom: 0; right: calc(var(--preview-action-size) + 24px); }
.hud-skin-preview .action-button { width: var(--preview-action-size); height: var(--preview-action-size); }
.hud-skin-preview #gui-buttons { position: absolute; left: 0; top: 150px; display: flex; gap: 8px; }
.hud-skin-preview #gui-buttons .gui-action-button { position: relative; top: auto; right: auto; }
.hud-skin-preview #opportunity-action-buttons { left: 0; right: auto; bottom: 0; }
.hud-skin-preview .gui-action-button { width: var(--preview-action-size); height: var(--preview-action-size); }
@media (max-width: 550px) { .hud-skin-preview-copy { max-width: calc(100% - 180px); } }
</style>
