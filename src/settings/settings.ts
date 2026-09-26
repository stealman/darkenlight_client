import { AudioManager } from '@/babylon/audio/audioManager'
import { ActionButtonsManager } from '@/gui/actionButtonsManager'

class DetailLevel {
    level = 0
    name: string

    // 0 = low, 1 = medium, 2 = high
    shadowQuality: number = 0
    antialias: boolean = false

    constructor(level: number, name: string, shadowQuality = 0, antialias = false) {
        this.level = level;
        this.name = name;
        this.shadowQuality = shadowQuality;
        this.antialias = antialias;
    }
}

const DetailLevels= {
    LOW: new DetailLevel(1, 'LOW', 0, true),
    MEDIUM: new DetailLevel(2, 'MEDIUM', 1, true),
    HIGH: new DetailLevel(3, 'HIGH', 2, true),
}

export const Settings = {
    deviceType: null as string,
    language: 'cs' as string,
    detailLevel: DetailLevels.MEDIUM,
    detailLevelName: 'MEDIUM',

    // For character model debugging
    closeView: false as boolean,

    touchEnabled: false,
    mouseEnabled: false,

    brightness: 5,
    volume: 0.5,
    ambientVolume: 1,
    targetMarkerOpacity: 1,
    displayGlow: true as boolean,

    hudSize: 1 as number,
    joystickSize: 100 as number,
    joystickBottom: 50 as number,
    joystickLeft: 120 as number,
    targetLockSize: 64 as number,
    targetLockBottom: 130 as number,
    targetLockLeft: 200 as number,

    autoTarget: false as boolean,
    actionButtonSize: 64 as number,
    miniMapSize: 50 as number,
    actionButtonsLayout: '1COLUMN' as string,
    actionButtonsYOffset: 0 as number,
    actionButtonCount: 6 as number,

    initialize(storedSettings) {
        const detectedTouchDevice = typeof navigator !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0)
        this.deviceType = ['DESKTOP', 'TABLET', 'PHONE'].includes(storedSettings.deviceType) ? storedSettings.deviceType : detectedTouchDevice ? 'PHONE' : 'DESKTOP'
        this.language = storedSettings.language || 'cs'
        switch (storedSettings.detailLevelName) {
            case 'LOW':
                this.detailLevel = DetailLevels.LOW;
                break;
            case 'MEDIUM':
                this.detailLevel = DetailLevels.MEDIUM;
                break;
            case 'HIGH':
                this.detailLevel = DetailLevels.HIGH;
                break;
            default:
                this.detailLevel = DetailLevels.MEDIUM;
        }
        this.detailLevelName = storedSettings.detailLevelName

        this.brightness = parseInt(storedSettings.brightness)
        this.targetMarkerOpacity = Number.isFinite(parseFloat(storedSettings.targetMarkerOpacity)) ? parseFloat(storedSettings.targetMarkerOpacity) : 1
        this.displayGlow = storedSettings.displayGlow
        this.hudSize = parseFloat(storedSettings.hudSize)
        this.joystickSize = parseInt(storedSettings.joystickSize)
        this.joystickBottom = parseInt(storedSettings.joystickBottom)
        this.joystickLeft = parseInt(storedSettings.joystickLeft)
        const storedTargetLockSize = parseInt(storedSettings.targetLockSize)
        const storedTargetLockBottom = parseInt(storedSettings.targetLockBottom)
        const storedTargetLockLeft = parseInt(storedSettings.targetLockLeft)
        const targetLockDefaultPosition = this.getDefaultTargetLockPosition(this.deviceType === 'PHONE' ? 30 : this.deviceType === 'TABLET' ? 40 : 0, this.deviceType === 'PHONE' ? 64 : this.deviceType === 'TABLET' ? 250 : 0)
        const hasPreviousTargetLockDefault = storedTargetLockSize === 64 && (
            (storedTargetLockLeft === 200 && storedTargetLockBottom === 130) ||
            (storedTargetLockLeft === 250 && storedTargetLockBottom === 430)
        )
        this.targetLockSize = Number.isFinite(storedTargetLockSize) ? storedTargetLockSize : 64
        this.targetLockBottom = Number.isFinite(storedTargetLockBottom) && !hasPreviousTargetLockDefault ? storedTargetLockBottom : targetLockDefaultPosition.bottom
        this.targetLockLeft = Number.isFinite(storedTargetLockLeft) && !hasPreviousTargetLockDefault ? storedTargetLockLeft : targetLockDefaultPosition.left
        this.autoTarget = storedSettings.autoTarget
        this.volume = parseFloat(storedSettings.volume)
        this.ambientVolume = parseFloat(storedSettings.ambientVolume)

        if (storedSettings.actionButtonSize) {
            this.actionButtonSize = parseInt(storedSettings.actionButtonSize)
        }
        if (storedSettings.miniMapSize != null) {
            this.miniMapSize = parseInt(storedSettings.miniMapSize)
        }
        if (storedSettings.actionButtonsLayout) {
            this.actionButtonsLayout = storedSettings.actionButtonsLayout
        }
        if (storedSettings.actionButtonsYOffset) {
            this.actionButtonsYOffset = parseInt(storedSettings.actionButtonsYOffset)
        }
        if (storedSettings.actionButtonCount) {
            this.actionButtonCount = parseInt(storedSettings.actionButtonCount)
        }

        AudioManager.setGlobalVolume(this.volume)
        AudioManager.setAmbientSoundVolume(this.ambientVolume)
    },

    getDefaultSettings() {
        const targetLockDefaultPosition = Settings.getDefaultTargetLockPosition(Settings.touchEnabled ? 30 : 0, Settings.touchEnabled ? 64 : 0)
        return {
            deviceType: Settings.touchEnabled ? 'PHONE' : 'DESKTOP',
            detailLevelName: Settings.touchEnabled ? 'MEDIUM' : 'HIGH',
            language: 'cs',

            joystickSize: 100,
            joystickBottom: Settings.touchEnabled ? 100 : 50,
            joystickLeft: Settings.touchEnabled ? 30 : 120,
            targetLockSize: 64,
            targetLockBottom: targetLockDefaultPosition.bottom,
            targetLockLeft: targetLockDefaultPosition.left,

            brightness: 5,
            volume: 0.5,
            ambientVolume: 1,
            displayGlow: !Settings.touchEnabled,
            targetMarkerOpacity: 1,
            hudSize: 1,

            autoTarget: false,
            actionButtonSize: Settings.touchEnabled ? 40 : 64,
            miniMapSize: 50,
            actionButtonsLayout: '1COLUMN',
            actionButtonsYOffset: 0,
            actionButtonCount: 6,
        }
    },

    storeSettings() {
        localStorage.setItem("DARKENLIGHT_STORED_SETTINGS", JSON.stringify(this))
    },

    getDefaultTargetLockPosition(extraRightOffset = 0, verticalOffset = 0) {
        const targetLockSize = 64
        const viewportWidth = typeof window === 'undefined' ? 360 : window.innerWidth
        const viewportHeight = typeof window === 'undefined' ? 640 : window.innerHeight
        const miniMap = typeof document === 'undefined' ? null : document.getElementById('miniMapCanvas')

        if (miniMap) {
            const miniMapBounds = miniMap.getBoundingClientRect()
            return {
                left: Math.round(miniMapBounds.left + (miniMapBounds.width - targetLockSize) / 2 - extraRightOffset),
                bottom: Math.max(0, Math.round(viewportHeight - miniMapBounds.bottom - 14 - targetLockSize - verticalOffset)),
            }
        }

        return {
            left: Math.max(0, viewportWidth - targetLockSize - 20 - extraRightOffset),
            bottom: Math.max(0, viewportHeight - 114 - targetLockSize - verticalOffset),
        }
    },

    setDetailLevel(level: string) {
        this.detailLevelName = level
        switch (level) {
            case 'LOW':
                this.detailLevel = DetailLevels.LOW
                break
            case 'MEDIUM':
                this.detailLevel = DetailLevels.MEDIUM
                break
            case 'HIGH':
                this.detailLevel = DetailLevels.HIGH
                break
        }
    },

    deviceTypeChanged() {
        ActionButtonsManager.buttonSizeChanged(this.actionButtonSize)
    },

    isShadowsEnabled(): boolean {
        return this.detailLevel.shadowQuality > 0
    },

    isHudButtonsAnimationsEnabled(): boolean {
        return this.detailLevel === DetailLevels.HIGH
    },

    isDetalLevelLow(): boolean {
        return this.detailLevel === DetailLevels.LOW
    },

    isDetalLevelHigh(): boolean {
        return this.detailLevel === DetailLevels.HIGH
    },

    isDetailLevelMedium(): boolean {
        return this.detailLevel === DetailLevels.MEDIUM
    },

    getDeviceType(): string {
        return this.deviceType
    },

    isPhoneOrTablet(): boolean {
        return this.deviceType === 'PHONE' || this.deviceType === 'TABLET'
    },

    setTargetMarkerOpacity(value: number) {
        this.targetMarkerOpacity = value;
    },

    setVolume(value: number) {
        this.volume = value;
        AudioManager.setGlobalVolume(value);
    },

    setAmbientVolume(value: number) {
        this.ambientVolume = value;
        AudioManager.setAmbientSoundVolume(value);
    },

    setDisplayGlow(value: boolean) {
        this.displayGlow = value;
    },

    setHudSize(value: number) {
        this.hudSize = value;
    }
}


