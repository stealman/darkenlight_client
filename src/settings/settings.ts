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
    detailLevel: DetailLevels.MEDIUM,

    shadows: true as boolean,
    debug: false as boolean,

    // For character model debugging
    closeView: false as boolean,

    touchEnabled: false,
    mouseEnabled: false,
    lockedCamera: false,
    cameraSensitivity: 0.3,

    brightness: 5,
    targetMarkerOpacity: 1,
    fogDensity: 4,
    displayGlow: true as boolean,
    autoTargeting: true as boolean,
    autoFire: true as boolean,

    hudSize: 1 as number,

    initialize(storedSettings) {
        this.deviceType = storedSettings.DEVICE_TYPE

        switch (storedSettings.DETAILS_LEVEL) {
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

        this.brightness = parseInt(storedSettings.BRIGHTNESS)
        this.fogDensity = parseInt(storedSettings.FOG_INTENSITY)
        this.targetMarkerOpacity = parseFloat(storedSettings.TARGET_MARKER_OPACITY)
        this.cameraSensitivity = parseFloat(storedSettings.CAMERA_SENSITIVITY)
        this.lockedCamera = storedSettings.CAMERA_LOCK
        this.displayGlow = storedSettings.DISPLAY_GLOW
        this.autoTargeting = storedSettings.AUTO_TARGETING
        this.autoFire = storedSettings.AUTO_FIRE
        this.hudSize = parseFloat(storedSettings.HUD_SIZE)
    },

    isShadowsEnabled(): boolean {
        return this.detailLevel.shadowQuality > -1;
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

    setFogIntensity(value: number) {
        //this.fogDensity = value;
        //getScene().fogDensity = 0.000015 * this.fogDensity
    },

    setTargetMarkerOpacity(value: number) {
        this.targetMarkerOpacity = value;
    },

    setDisplayGlow(value: boolean) {
        this.displayGlow = value;
    },

    setHudSize(value: number) {
        this.hudSize = value;
    }
}


