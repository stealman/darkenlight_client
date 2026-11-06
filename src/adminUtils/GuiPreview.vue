<template>
    <main class="gui-preview">
        <nav class="gui-preview-nav">
            <a href="/adminUtils">Admin utils</a>
            <span>GUI · offline náhled</span>
            <label>Úzký panel <input v-model="narrow" type="checkbox"></label>
            <label>Náhled <select v-model="preview"><option value="controls">Ovládací prvky</option><option value="inventory">Inventář</option><option value="storage">Banka / barel</option><option value="hud">Akční panel a minimapa</option><option value="status">Postava, party a cíl</option></select></label>
            <label v-if="preview === 'inventory' || preview === 'storage'">Dlouhý inventář <input v-model="longInventory" type="checkbox"></label>
        </nav>
        <HudSkinPreview v-if="preview === 'hud'" :small="narrow" />
        <StatusSkinPreview v-else-if="preview === 'status'" :small="narrow" />
        <GameDialog v-else :window-class="['adaptive', 'gui-preview-window', narrow ? 'gui-preview-window--narrow' : '']" :close-on-backdrop="false" :close-on-escape="false">
            <template #header v-if="preview === 'controls'">
                <div v-for="tab in tabs" :key="tab" class="tab-item" :class="{ active: activeTab === tab }" @click="activeTab = tab">{{ tab }}</div>
            </template>
            <template #header v-else>{{ preview === 'inventory' ? 'Inventář' : 'Banka / barel' }}</template>
            <InventorySkinPreview v-if="preview !== 'controls'" :storage="preview === 'storage'" :slot-count="longInventory ? 120 : 24" />
            <section v-else class="gui-preview-content">
                <p>Úroveň detailů grafiky.</p>
                <div class="dialog-actions">
                    <button v-for="level in levels" :key="level" class="dialog-button" :class="{ selected: selected === level }" @click="selected = level">{{ level }}</button>
                </div>
                <label class="gui-preview-range">Jas <input v-model="brightness" aria-label="Jas" class="range-slider" type="range" min="0" max="100"></label>
                <label class="gui-preview-range">Jas označníku <input v-model="marker" aria-label="Jas označníku" class="range-slider" type="range" min="0" max="100"></label>
                <div class="gui-preview-controls">
                    <label><Checkbox v-model="checked" input-id="preview-checkbox" binary /> Vyhlazování ikon</label>
                    <label><Checkbox :model-value="false" binary disabled /> Nedostupné</label>
                </div>
                <div class="dialog-actions">
                    <button class="dialog-button" @click="modal = true">Otevřít dialog</button>
                    <button class="dialog-button" disabled>Nedostupné</button>
                </div>
                <label class="gui-preview-field">Jméno <input type="text" placeholder="Jméno postavy"></label>
            </section>
        </GameDialog>
        <GameDialog v-if="modal" window-class="adaptive" content-class="dialog-content--modal" @close="modal = false">
            <template #header>Potvrzení</template>
            <p>Náhled malého dialogu se stejnou sadou podkladů.</p>
            <div class="dialog-actions"><button class="dialog-button" @click="modal = false">Zpět</button><button class="dialog-button selected" @click="modal = false">Potvrdit</button></div>
        </GameDialog>
    </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import GameDialog from '../vue/views/GameDialog.vue'
import InventorySkinPreview from './InventorySkinPreview.vue'
import HudSkinPreview from './HudSkinPreview.vue'
import StatusSkinPreview from './StatusSkinPreview.vue'
const preview = ref('controls')
const longInventory = ref(false)
const tabs = ['Ovládání', 'Grafika', 'GUI', 'Zvuk', 'Účet']
const levels = ['Vysoká', 'Střední', 'Nízká']
const activeTab = ref('Grafika')
const selected = ref('Střední')
const brightness = ref(30)
const marker = ref(55)
const checked = ref(true)
const modal = ref(false)
const narrow = ref(false)
</script>

<style>
.gui-preview { min-height: 100dvh; background: radial-gradient(ellipse at 50% 30%, #39434a, #151d24 75%); }
.gui-preview-nav { position: relative; z-index: 2100; display: flex; flex-wrap: wrap; gap: 20px; padding: 14px; color: rgb(var(--ui-base)); font-size: 13px; }
.gui-preview-nav a { color: inherit; }
.dialog-window.gui-preview-window { min-height: 0; max-height: none; }
.gui-preview-window > .dialog-surface > .dialog-content { max-height: calc(100dvh - 180px); overflow-y: auto; }
.dialog-window.gui-preview-window--narrow { width: 340px; }
.gui-preview-content { padding: 12px 18px 24px; }
.gui-preview-content > p { margin: 8px 0 24px; }
.gui-preview-range { display: grid; grid-template-columns: 120px minmax(0, 1fr); align-items: center; gap: 16px; margin: 32px 0; text-align: left; }
.gui-preview-controls { display: flex; gap: 18px; justify-content: center; margin: 28px 0; flex-wrap: wrap; }
.gui-preview-controls label { display: flex; align-items: center; gap: 8px; }
.gui-preview-field { display: flex; justify-content: center; gap: 12px; align-items: center; margin-top: 24px; }
.gui-preview-content .dialog-actions { flex-wrap: wrap; }
@media (max-width: 420px) { .gui-preview-content { padding: 8px 8px 18px; } .gui-preview-range { grid-template-columns: 90px minmax(0, 1fr); } }
</style>
