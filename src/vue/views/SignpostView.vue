<template>
    <div
        ref="backdrop"
        class="signpost-reader-backdrop"
        :style="{ '--signpost-reader-scale': readerScale }"
        role="dialog"
        aria-modal="true"
        :aria-label="t('signpost.title')"
        @click.self="SignpostReader.closeFromBackdrop()"
        @pointerdown.stop
        @click.stop
    >
        <section ref="reader" class="signpost-reader" tabindex="-1" @click.self="SignpostReader.closeFromBackdrop()" @keydown.esc.stop.prevent="SignpostReader.close()" @keydown.tab.stop.prevent="closeButton?.focus()">
            <svg width="0" height="0" aria-hidden="true" focusable="false" class="signpost-reader-filters">
                <defs>
                    <filter id="signpost-incised-text" color-interpolation-filters="sRGB">
                        <feComponentTransfer in="SourceAlpha" result="outside">
                            <feFuncA type="table" tableValues="1 0" />
                        </feComponentTransfer>
                        <feOffset in="outside" dx="0.8" dy="2.4" />
                        <feGaussianBlur stdDeviation="0.35" />
                        <feComposite in2="SourceAlpha" operator="in" result="cut" />
                        <feFlood class="signpost-reader-cut-shadow" flood-opacity="1" />
                        <feComposite in2="cut" operator="in" result="inner-shadow" />
                        <feOffset in="outside" dy="-1" />
                        <feComposite in2="SourceAlpha" operator="in" result="lip" />
                        <feFlood class="signpost-reader-cut-highlight" flood-opacity="0.8" />
                        <feComposite in2="lip" operator="in" result="inner-highlight" />
                        <feMerge>
                            <feMergeNode in="SourceGraphic" />
                            <feMergeNode in="inner-shadow" />
                            <feMergeNode in="inner-highlight" />
                        </feMerge>
                    </filter>
                </defs>
            </svg>
            <div class="signpost-reader-boards" @click.self="SignpostReader.closeFromBackdrop()">
                <article v-for="(entry, index) in entries" :key="index" class="signpost-reader-board">
                    <svg class="signpost-reader-image" viewBox="0 149 2172 425" preserveAspectRatio="none" aria-hidden="true">
                        <image href="/images/gui/signpost-board.png" width="2172" height="724" />
                    </svg>
                    <div class="signpost-reader-inscription">
                        <div class="signpost-reader-direction" :aria-label="entry.direction">{{ entry.direction.charAt(0).toLocaleUpperCase() }}</div>
                        <div class="signpost-reader-text" :class="{'signpost-reader-text--long': entry.text.length > 85}">{{ entry.text }}</div>
                    </div>
                </article>
            </div>
            <button v-if="!isTouchDevice" ref="closeButton" class="signpost-reader-close" type="button" :aria-label="t('common.close')" @click="SignpostReader.close()">
                <span aria-hidden="true">&times;</span> <kbd>Esc</kbd>
            </button>
        </section>
    </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { SignpostReader } from '@/gui/signpostReader'
import { t } from '@/i18n'
import { Settings } from '@/settings/settings'

const entries = SignpostReader.entries
const backdrop = ref<HTMLElement | null>(null)
const readerScale = ref(1)
const isTouchDevice = Settings.touchEnabled || Settings.isPhoneOrTablet() || window.matchMedia('(any-pointer: coarse)').matches
let resizeObserver: ResizeObserver | null = null

// Fit the whole composition, including its close control and rotated edges.
// Measure unscaled layout so applying the transform cannot feed back into sizing.
const fitReader = () => {
    if (!reader.value || !backdrop.value) return
    const style = window.getComputedStyle(backdrop.value)
    const width = backdrop.value.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const height = backdrop.value.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    readerScale.value = Math.max(0, Math.min(1,
        width / (reader.value.offsetWidth + 16),
        height / (reader.value.offsetHeight + 48)))
}
const reader = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
let previousFocus: HTMLElement | null = null
onMounted(() => {
    previousFocus = document.activeElement as HTMLElement | null
    reader.value?.focus({preventScroll: true})
    fitReader()
    void document.fonts.ready.then(fitReader)
    resizeObserver = new ResizeObserver(fitReader)
    if (reader.value) resizeObserver.observe(reader.value)
    if (backdrop.value) resizeObserver.observe(backdrop.value)
    window.addEventListener('resize', fitReader)
    window.visualViewport?.addEventListener('resize', fitReader)
})
onUnmounted(() => {
    resizeObserver?.disconnect()
    window.removeEventListener('resize', fitReader)
    window.visualViewport?.removeEventListener('resize', fitReader)
    previousFocus?.focus({preventScroll: true})
})
</script>

<style>
.signpost-reader-backdrop {
    position: fixed;
    inset: 0;
    z-index: 2000;
    height: 100dvh;
    padding: 28px 12px;
    box-sizing: border-box;
    background: rgb(0 0 0 / 12%);
    backdrop-filter: blur(1px);
    -webkit-backdrop-filter: blur(1px);
    overflow: hidden;
}
.signpost-reader {
    position: absolute;
    top: 50%;
    left: 50%;
    width: min(760px, 94vw);
    margin: 0;
    transform: translate(-50%, -50%) scale(var(--signpost-reader-scale, 1));
    transform-origin: center;
    padding: 24px 0;
    text-align: center;
    outline: none;
    color: var(--signpost-reader-ink);
}
.signpost-reader::before {
    content: '';
    position: absolute;
    inset: -18px -40px;
    pointer-events: none;
    background: radial-gradient(ellipse, rgb(0 0 0 / 36%), transparent 72%);
    filter: blur(20px);
}
.signpost-reader-boards { display: grid; gap: 18px; }
.signpost-reader-board {
    position: relative;
    display: grid;
    align-items: center;
    min-height: clamp(100px, 16vh, 155px);
    filter: drop-shadow(0 12px 9px rgb(0 0 0 / 60%));
    transform: rotate(-.65deg);
}
.signpost-reader-board:nth-child(even) { transform: rotate(.55deg); }
.signpost-reader-image { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.signpost-reader-inscription {
    position: relative;
    display: grid;
    grid-template-columns: clamp(28px, 4.6vw, 44px) minmax(0, 1fr);
    align-items: center;
    column-gap: clamp(12px, 2.5vw, 28px);
    padding: 24px 17% 26px 10%;
}
.signpost-reader-direction {
    color: var(--signpost-reader-muted);
    font: 400 clamp(20px, 3.4vw, 32px)/1 "Press Start 2P", monospace;
    text-transform: uppercase;
    filter: url(#signpost-incised-text);
}
.signpost-reader-text {
    font: 400 clamp(16px, 2.8vw, 25px)/1.6 "Press Start 2P", monospace;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    text-shadow: none;
    filter: url(#signpost-incised-text);
}
.signpost-reader-filters { position: absolute; pointer-events: none; }
.signpost-reader-cut-shadow { flood-color: var(--signpost-reader-cut-shadow); }
.signpost-reader-cut-highlight { flood-color: var(--signpost-reader-cut-highlight); }
.signpost-reader-text--long { font-size: clamp(12px, 2vw, 18px); }
.signpost-reader-close {
    position: absolute;
    top: -16px;
    right: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 44px;
    min-height: 44px;
    justify-content: center;
    padding: 8px 12px;
    border: 0;
    background: transparent;
    color: var(--signpost-reader-muted);
    font: 13px Georgia, 'Times New Roman', serif;
    cursor: pointer;
}
.signpost-reader-close:hover, .signpost-reader-close:focus-visible { color: var(--signpost-reader-ink); }
.signpost-reader-close kbd { margin-left: 8px; padding: 2px 5px; border: 1px solid currentColor; border-radius: 3px; font: inherit; font-size: 11px; }
@media (max-width: 480px) {
    .signpost-reader-inscription { padding-top: 22px; padding-bottom: 22px; }
    .signpost-reader-boards { gap: 10px; }
}
</style>
