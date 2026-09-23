<template>
    <div
        :id="backdropId"
        :class="backdropClass"
        @click.self="onBackdropClick"
    >
        <div
            ref="windowRef"
            :class="windowClass"
        >
            <div class="dialog-surface">
                <div v-if="$slots.header" class="dialog-header">
                    <slot name="header" />
                </div>
                <div :class="contentClass">
                    <slot />
                </div>
            </div>
        </div>
        <slot name="overlay" />
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = withDefaults(defineProps<{
    backdropId?: string
    backdropClass?: string | string[]
    windowClass?: string | string[]
    contentClass?: string | string[]
    closeOnBackdrop?: boolean
    closeOnEscape?: boolean
}>(), {
    backdropId: undefined,
    backdropClass: '',
    windowClass: '',
    contentClass: '',
    closeOnBackdrop: true,
    closeOnEscape: true,
})

const emit = defineEmits(['close', 'backdrop-click'])
const windowRef = ref<HTMLElement | null>(null)

const backdropClass = computed(() => ['dialog-backdrop', props.backdropClass])
const windowClass = computed(() => ['dialog-window', props.windowClass])
const contentClass = computed(() => ['dialog-content', props.contentClass])

const closeDialog = () => {
    emit('close')
}

const onBackdropClick = () => {
    emit('backdrop-click')
    if (!props.closeOnBackdrop) return
    closeDialog()
}

const onDialogKeyDown = (event: KeyboardEvent) => {
    if (!props.closeOnEscape) return
    if (event.key === 'Escape') {
        closeDialog()
    }
}

onMounted(() => {
    window.addEventListener('keydown', onDialogKeyDown)
})

onUnmounted(() => {
    window.removeEventListener('keydown', onDialogKeyDown)
})

defineExpose({
    windowRef,
})
</script>
