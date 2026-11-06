<template>
    <section class="status-skin-preview" :class="{ 'status-skin-preview--small': small }">
        <div class="status-skin-controls">
            <label>Zdraví <input v-model.number="hp" type="range" min="0" max="100"></label>
            <label><input v-model="ally" type="checkbox"> Přátelský cíl</label>
            <label><input v-model="mana" type="checkbox"> Mana</label>
            <label><input v-model="longName" type="checkbox"> Dlouhá jména</label>
            <label><input v-model="hasTarget" type="checkbox"> Označený cíl</label>
        </div>
        <div class="status-skin-stage" :style="{ '--hud-minimap-size': mapSize + 'px' }">
            <button class="hud-settings-button" type="button" aria-label="Náhled nastavení" v-html="getSettingsSvg('', 'preview-settings')"></button>
            <canvas ref="miniMap" id="miniMapCanvas" width="100" height="100" aria-label="Náhled minimapy" style="width: var(--hud-minimap-size); height: var(--hud-minimap-size)"></canvas>
            <div id="myStatusPanel" style="--affect-icon-size: 22px; --affect-icon-gap: 4px; --affect-icon-adverse-gap: 7px">
                <div class="myStatusPanelBody">
                    <div class="statusRow statusRowMain">
                        <div class="hpBlocks"><div v-for="n in 10" :key="n" class="hpBlock"><div class="hpFill" :style="{ width: segment(hp, n, 10) }"></div></div></div>
                        <span class="myName">{{ longName ? 'Ace Stealman Dlouhé příjmení' : 'Ace Stealman' }}</span>
                        <div id="my-status-currency-host"><div id="emeralds-info"><span id="emeralds-info-count" class="ui-emerald-text-gradient">35 153</span><img id="emeralds-info-icon" src="/images/icons/emerald.png" alt=""></div></div>
                    </div>
                    <div class="statusRow statusRowSecondary">
                        <div v-for="resource in mana ? ['stamina', 'mana'] : ['stamina']" :key="resource" class="secondaryBar" :class="[resource + 'Bar', mana ? 'halfSegments' : 'fullWidth']">
                            <div class="secondaryBlocks"><div v-for="n in (mana ? 5 : 10)" :key="n" class="secondaryBlock"><div class="secondaryBlockFill" :style="{ width: segment(resource === 'stamina' ? 42 : 81, n, mana ? 5 : 10) }"></div></div></div>
                        </div>
                    </div>
                </div>
                <div class="statusRowAffects"><div v-for="(row, rowIndex) in [effects.slice(0, 2), effects.slice(2)]" :key="rowIndex" class="affectsIcons" :class="rowIndex === 0 ? 'affectsIcons--positive' : 'affectsIcons--adverse'">
                    <div v-for="(effect, index) in row" :key="effect" class="affectIcon" :class="rowIndex === 0 ? 'positive' : 'adverse'">
                        <img :src="`/images/icons/affects/${effect}.png`" :alt="effect" class="affectIconImage"><span v-if="rowIndex === 0 && index === 0" class="affectIconCount">2</span>
                    </div>
                </div></div>
                <div id="party-panel-host"><section class="party-panel">
                    <button v-for="(member, index) in members" :key="member.name" class="party-member" :class="{ 'party-member--selected': selected === index, 'party-member--away': index === 2 }" @click="selected = index">
                        <span class="party-name"><span v-if="index === 0" class="party-leader">♛</span>{{ longName ? member.name + ' ze Severního údolí' : member.name }}</span>
                        <span v-if="index !== 2" class="party-resources"><span v-for="(value, resource) in member.bars" :key="resource" class="party-bar" :class="'party-bar--' + resource"><span :style="{ width: value + '%' }"></span></span></span>
                        <span v-else class="party-away-mark">· · ·</span>
                    </button>
                    <div class="party-actions"><button class="party-menu-button" aria-label="Akce party">⋯</button></div>
                </section></div>
            </div>
            <div id="gui-buttons">
                <div id="btn-backpack" class="gui-action-button" style="width: 48px; height: 48px"><img class="action-icon" src="/images/icons/buttons/btn_backpack.png" alt="Inventář"></div>
                <div id="btn-character" class="gui-action-button" style="width: 48px; height: 48px"><img class="action-icon" src="/images/icons/buttons/btn_char.png" alt="Postava"></div>
                <div id="btn-speech" class="gui-action-button" style="width: 48px; height: 48px"><img class="action-icon" src="/images/icons/buttons/btn_speech.png" alt="Chat"></div>
            </div>
            <div class="status-skin-joystick" aria-label="Poloha joysticku v náhledu">Joystick</div>
            <div id="selectedTargetPanel" :class="!hasTarget ? 'empty' : ally ? 'ally' : 'enemy'" style="display: flex">
                <div class="hpBlocks"><div v-for="n in 10" :key="n" class="hpBlock"><div class="hpFill" :style="{ width: segment(hasTarget ? hp : 0, n, 10) }"></div></div></div>
                <span class="targetName">{{ !hasTarget ? '' : ally ? 'Lesní strážce' : longName ? 'Prastarý vlk ze Severního údolí' : 'Prastarý vlk' }}</span>
            </div>
            <p class="status-skin-caption">Offline náhled · stejné styly jako ve hře</p>
        </div>
    </section>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { getSettingsSvg } from '../vue/icons/icons'
defineProps<{ small: boolean }>()
const hp = ref(68)
const hasTarget = ref(true)
const miniMap = ref<HTMLCanvasElement | null>(null)
const mapSize = ref(100)
const resizeMap = () => { mapSize.value = Math.round(Math.min(150, Math.min(innerWidth, innerHeight) / 5)) }
onMounted(() => {
    resizeMap()
    window.addEventListener('resize', resizeMap)
    const ctx = miniMap.value?.getContext('2d')
    if (ctx) {
        ctx.fillStyle = '#78847c'; ctx.fillRect(0, 0, 100, 100)
        ctx.fillStyle = '#3e5047'; ctx.fillRect(10, 12, 34, 25); ctx.fillRect(58, 62, 30, 24)
        ctx.fillStyle = '#b7b6a2'; ctx.fillRect(45, 0, 10, 100)
        ctx.fillStyle = '#e6c07f'; ctx.fillRect(48, 48, 4, 4)
    }
})
onUnmounted(() => window.removeEventListener('resize', resizeMap))
const mana = ref(true)
const ally = ref(false)
const longName = ref(false)
const selected = ref(0)
const effects = ['meal', 'flame_arrow', 'tired', 'damaged_armor']
const members = [ { name: 'Elowen', bars: { hp: 87, st: 54, mp: 75 } }, { name: 'Borin', bars: { hp: 26, st: 68 } }, { name: 'Tarin', bars: {} } ]
const segment = (value: number, index: number, count: number) => `${Math.max(0, Math.min(100, (value - (index - 1) * 100 / count) * count))}%`
</script>

<style>
.status-skin-preview { width: calc(100% - 24px); margin: 20px auto; }
.status-skin-preview--small { width: min(390px, calc(100% - 24px)); }
.status-skin-controls { display: flex; flex-wrap: wrap; gap: 12px 20px; margin-bottom: 18px; color: rgb(var(--ui-base)); font-size: 13px; }
.status-skin-controls label { display: flex; align-items: center; gap: 6px; }
.status-skin-stage { position: relative; min-height: 220px; height: min(600px, 100dvh); background: radial-gradient(ellipse at 25% 60%, #394c40, #202b30 70%); }
.status-skin-caption { position: absolute; bottom: 12px; left: 125px; right: 12px; font-size: 12px; color: rgb(var(--ui-dark)); }
.status-skin-joystick { position: absolute; left: 120px; bottom: 50px; width: 100px; height: 100px; border-radius: 50%; background: rgba(75, 122, 163, .12); border: 1px dashed rgba(139, 183, 218, .4); display: flex; align-items: center; justify-content: center; color: rgb(var(--ui-dark)); font-size: 10px; pointer-events: none; }
.status-skin-stage > .hud-settings-button { position: absolute; bottom: max(5px, env(safe-area-inset-bottom)); left: calc(max(5px, env(safe-area-inset-left)) + 53px); }
.status-skin-stage #gui-buttons { position: static; }
.status-skin-stage #gui-buttons > #btn-backpack,
.status-skin-stage #gui-buttons > #btn-character { position: absolute; top: 32px; right: calc(var(--hud-minimap-size, 100px) + 9px); }
.status-skin-stage #gui-buttons > #btn-backpack { right: calc(var(--hud-minimap-size, 100px) + 62px); }
.status-skin-stage #gui-buttons > #btn-speech { position: absolute; }
</style>
