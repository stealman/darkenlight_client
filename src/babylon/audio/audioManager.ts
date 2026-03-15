import { Engine, Scene, Sound, Vector3 } from '@babylonjs/core'
import { Utils } from '@/utils/utils'
import { Settings } from '@/settings/settings'
import { AudioUtils } from '@/babylon/audio/audioUtils'

export const AudioManager = {
    globalVolume: 0.5,
    ambientSoundVolume: 0.5,

    BASE_PATH: './sounds/',
    BASE_PATH_SFX: './sounds/sfx/',
    BASE_PATH_AMBIENT: './sounds/ambient/',
    BASE_PATH_MONSTER: './sounds/monster/',
    BASE_PATH_GUI: './sounds/gui/',

    footStepSounds: new Map<string, Sound>(),
    deathRattleSounds: new Map<string, Sound>(),
    ambientSounds: new Map<object, Sound>(),

    swordSwingSounds: [] as Sound[],
    swordHitHardSounds: [] as Sound[],
    swordHitMetalSounds: [] as Sound[],
    boneHitSounds: [] as Sound[],
    swordBlockSounds: [] as Sound[],

    guiButtonClickSound: null as Sound | null,
    guiButtonToggleOnSound: null as Sound | null,
    guiButtonToggleOffSound: null as Sound | null,
    guiTickSound: null as Sound | null,

    lowHealthWarningSound: null as Sound | null,
    heartBeatSound: null as Sound | null,

    backpackHandleSound: null as Sound | null,
    backpackHandle2Sound: null as Sound | null,

    actualAmbientSound: null as Sound | null,

    miningSounds: [] as Sound[],
    lumberJackingSounds: [] as Sound[],

    initialize(scene: Scene) {
        this.globalVolume = Settings.volume;
        this.ambientSoundVolume = Settings.ambientVolume;

        this.footStepSounds.set(FootStepTypes.SNOW, new Sound("footStepSnow", AudioManager.BASE_PATH_SFX + "steps-snow.ogg", scene, function() {
            AudioManager.footStepSounds.get(FootStepTypes.SNOW)!['loaded'] = true;
            AudioManager.footStepSounds.get(FootStepTypes.SNOW)!['defaultVolume'] = 0.4;
        }, {
            volume: 0.4,
            playbackRate: 1,
            loop: true,
        }))

        this.footStepSounds.set(FootStepTypes.DIRT, new Sound("footStepDirt", AudioManager.BASE_PATH_SFX + "steps-dirt.ogg", scene, function() {
            AudioManager.footStepSounds.get(FootStepTypes.DIRT)!['loaded'] = true;
            AudioManager.footStepSounds.get(FootStepTypes.DIRT)!['defaultVolume'] = 0.8;
        }, {
            volume: 1.1,
            playbackRate: 1,
            loop: true,
        }))

        // Battle sounds
        this.loadSoundArray(this.swordSwingSounds, ["swing1.ogg", "swing2.ogg", "swing3.ogg"], "swordSwingSound", scene, { volume: 1, playbackRate: 1 } );
        this.loadSoundArray(this.swordHitMetalSounds, ["hit-sword-metal1.ogg"], "swordHitMetalSound", scene, { volume: 0.5, playbackRate: 1 } );
        this.loadSoundArray(this.swordHitHardSounds, ["hit-sword-hard1.ogg", "hit-sword-hard2.ogg"], "swordHitHardSound", scene, { volume: 0.6, playbackRate: 1.1 } );
        this.loadSoundArray(this.swordBlockSounds, ["block-sword1.ogg", "block-sword2.ogg"], "swordBlockSound", scene, { volume: 0.5, playbackRate: 0.9 } );
        this.loadSoundArray(this.boneHitSounds, ["hit-bone1.ogg"], "boneHitSound", scene, { volume: 0.6, playbackRate: 1 } );

        // Death rattles
        this.loadDeathRattleSound(MonsterSoundTypes.SKELETON, "death-skeleton.ogg", scene, { volume: 0.7, playbackRate: 0.85 } );
        this.loadDeathRattleSound(MonsterSoundTypes.CAT, "death-cat.ogg", scene, { volume: 0.3, playbackRate: 1 } );

        // Ambient sounds
        this.loadAmbientSound(AmbientSoundTypes.WINTER_FOREST, "winter-forest.ogg", scene, { volume: AmbientSoundTypes.WINTER_FOREST.defaultVolume, playbackRate: 1, loop: true } );
        this.actualAmbientSound = this.ambientSounds.get(AmbientSoundTypes.WINTER_FOREST)!;

        // Mining sounds
        this.loadSoundArray(this.miningSounds, ["mining1.ogg", "mining2.ogg", "mining3.ogg", "mining4.ogg"], "miningSound", scene, { volume: 1, playbackRate: 1 } );

        // Lumberjacking sounds
        this.loadSoundArray(this.lumberJackingSounds, ["lumber1.ogg", "lumber2.ogg", "lumber3.ogg", "lumber4.ogg"], "lumberJackingSound", scene, { volume: 1, playbackRate: 1 } );

        this.guiButtonClickSound = new Sound("guiButtonClick", AudioManager.BASE_PATH_GUI + "button-click.ogg", scene, function() {
            AudioManager.guiButtonClickSound!['loaded'] = true;
        }, {
            volume: 1.25,
            playbackRate: 1,
        });

        this.guiButtonToggleOnSound = new Sound("guiButtonToggleOn", AudioManager.BASE_PATH_GUI + "button-toggle-on.ogg", scene, function() {
            AudioManager.guiButtonToggleOnSound!['loaded'] = true;
        }, {
            volume: 0.35,
            playbackRate: 1.25,
        });

        this.guiButtonToggleOffSound = new Sound("guiButtonToggleOff", AudioManager.BASE_PATH_GUI + "button-toggle-off.ogg", scene, function() {
            AudioManager.guiButtonToggleOffSound!['loaded'] = true;
        }, {
            volume: 0.35,
            playbackRate: 1.25,
        });

        this.guiTickSound = new Sound("guiTick", AudioManager.BASE_PATH_GUI + "tick.ogg", scene, function() {
            AudioManager.guiTickSound!['loaded'] = true;
        }, {
            volume: 0.3,
            playbackRate: 1.25,
        });

        this.lowHealthWarningSound = new Sound("lowHealthWarning", AudioManager.BASE_PATH_SFX + "low-health-warning.ogg", scene, function() {
            AudioManager.lowHealthWarningSound!['loaded'] = true;
        }, {
            volume: 1,
            playbackRate: 1,
        });

        this.heartBeatSound = new Sound("heartBeat", AudioManager.BASE_PATH_SFX + "heartbeat.ogg", scene, function() {
            AudioManager.heartBeatSound!['loaded'] = true;
        }, {
            volume: 0.7,
            playbackRate: 1.1,
            loop: true,
        });

        this.backpackHandleSound = new Sound("backpackHandle", AudioManager.BASE_PATH_SFX + "backpack-handle.ogg", scene, function() {
            AudioManager.backpackHandleSound!['loaded'] = true;
        }, {
            volume: 1.25,
            playbackRate: 1,
        });

        this.backpackHandle2Sound = new Sound("backpackHandle2", AudioManager.BASE_PATH_SFX + "backpack-handle2.ogg", scene, function() {
            AudioManager.backpackHandle2Sound!['loaded'] = true;
        }, {
            volume: 0.45,
            playbackRate: 1,
        });

        Engine.audioEngine?.setGlobalVolume(this.globalVolume)
        this.setAmbientSoundVolume(this.ambientSoundVolume)
    },

    processOneFrame() {
        // If actual ambient sound is not playing, play it
        if (this.actualAmbientSound && !this.actualAmbientSound.isPlaying) {
            this.actualAmbientSound.play();
        }
    },

    loadSoundArray(targetArray: [Sound], fileNames: string[], soundName: string, scene: Scene, options: { volume: number, playbackRate: number }): Sound[] {
        fileNames.forEach((file, index) => {
            const sound = new Sound(soundName + index, AudioManager.BASE_PATH_SFX + file, scene, function() {
                sound['loaded'] = true;
                sound['defaultVolume'] = options.volume;
            }, options);
            targetArray.push(sound);
        });
    },

    loadDeathRattleSound (type: string, fileName: string, scene: Scene, options: { volume: number, playbackRate: number }) {
        const sound = new Sound("deathRattle" + type, AudioManager.BASE_PATH_MONSTER + fileName, scene, function() {
            sound['loaded'] = true;
            sound['defaultVolume'] = options.volume;
        }, options);
        this.deathRattleSounds.set(type, sound);
    },

    loadAmbientSound (type: object, fileName: string, scene: Scene, options: { volume: number, playbackRate: number, loop: boolean }) {
        const sound = new Sound("ambientSound" + type, AudioManager.BASE_PATH_AMBIENT + fileName, scene, function() {
            sound['loaded'] = true;
        }, options);
        this.ambientSounds.set(type, sound);
    },

    playWeaponSwing(type: string, position: Vector3) {
        const volumeRatio = AudioUtils.getVolumeRatioByDistance(position)
        switch (type) {
            case WeaponSoundTypes.SWORD:
                this.playRandomSound(this.swordSwingSounds, volumeRatio)
                break;
            case WeaponSoundTypes.BONE:
                this.playRandomSound(this.swordSwingSounds, volumeRatio)
                break;
        }
    },

    playWeaponHit(weaponType: string, targetType: string, position: Vector3) {
        const volumeRatio = AudioUtils.getVolumeRatioByDistance(position)
        switch (weaponType) {
            case WeaponSoundTypes.SWORD:

                switch (targetType) {
                    case BodySoundTypes.HARD:
                        this.playRandomSound(this.swordHitHardSounds, volumeRatio)
                        break
                    case BodySoundTypes.METAL:
                        this.playRandomSound(this.swordHitMetalSounds, volumeRatio)
                        break
                }
                break
            case WeaponSoundTypes.BONE:
                this.playRandomSound(this.boneHitSounds, volumeRatio)
                break
        }
    },

    playWeaponBlocked(targetType: string, position: Vector3) {
        const volumeRatio = AudioUtils.getVolumeRatioByDistance(position)
        switch (targetType) {
            case WeaponSoundTypes.SWORD:
                this.playRandomSound(this.swordBlockSounds, volumeRatio)
                break;
        }
    },

    playMiningSound(position: Vector3) {
        const volumeRatio = AudioUtils.getVolumeRatioByDistance(position)
        this.playRandomSound(this.miningSounds, volumeRatio)
    },

    playLumberJackingSound(position: Vector3) {
        const volumeRatio = AudioUtils.getVolumeRatioByDistance(position)
        this.playRandomSound(this.lumberJackingSounds, volumeRatio)
    },

    playRandomSound(soundArray: Sound[], volumeRatio: number = 1) {
        const sound = soundArray[Utils.rollDice(soundArray.length, true)];
        sound.setVolume(sound.defaultVolume * volumeRatio)
        if (sound['loaded']) {
            sound.play();
        }
    },

    playDeathRattle(type: string, position: Vector3) {
        const sound = this.deathRattleSounds.get(type)!

        const ratio = AudioUtils.getVolumeRatioByDistance(position)
        sound.setVolume(sound.defaultVolume * ratio)
        if (sound['loaded']) {
            sound.play();
        }
    },

    playGuiButtonClick() {
        if (this.guiButtonClickSound && this.guiButtonClickSound['loaded']) {
            this.guiButtonClickSound.play();
        }
    },

    playGuiButtonToggle(on: boolean) {
        const sound = on ? this.guiButtonToggleOnSound : this.guiButtonToggleOffSound;
        if (sound && sound['loaded']) {
            sound.play();
        }
    },

    playGuiTick() {
        if (this.guiTickSound && this.guiTickSound['loaded']) {
            this.guiTickSound.play();
        }
    },

    playLowHealthWarning() {
        if (this.lowHealthWarningSound && this.lowHealthWarningSound['loaded']) {
            this.lowHealthWarningSound.play();
        }
    },

    playHeartBeat() {
        if (this.heartBeatSound && this.heartBeatSound['loaded'] && !this.heartBeatSound.isPlaying) {
            this.heartBeatSound.play();
        }
    },

    playBackpackHandle() {
        if (this.backpackHandleSound && this.backpackHandleSound['loaded']) {
            this.backpackHandleSound.play();
        }
    },

    playBackpackHandle2() {
        if (this.backpackHandle2Sound && this.backpackHandle2Sound['loaded']) {
            this.backpackHandle2Sound.play();
        }
    },

    setHeartBeatVolume(volume: number) {
        if (this.heartBeatSound) {
            this.heartBeatSound.setVolume(volume);
        }
    },

    setAmbientSoundVolume(volume: number) {
        Object.keys(AmbientSoundTypes).forEach((key) => {
            const ambientSound = this.ambientSounds.get(AmbientSoundTypes[key]);
            if (ambientSound) {
                ambientSound.setVolume(volume * AmbientSoundTypes[key].defaultVolume);
            }
        });
    },

    stopAmbientSound() {
        if (this.actualAmbientSound && this.actualAmbientSound.isPlaying) {
            this.actualAmbientSound.stop();
        }
    },

    stopHeartBeat() {
        if (this.heartBeatSound && this.heartBeatSound.isPlaying) {
            this.heartBeatSound.stop();
        }
    },

    setGlobalVolume(volume: number) {
        this.globalVolume = volume;
        Engine.audioEngine?.setGlobalVolume(this.globalVolume);
    },

}

export const FootStepTypes = {
    SNOW: 'SNOW',
    DIRT: 'DIRT',
}

export const AmbientSoundTypes = {
    WINTER_FOREST: {name: 'WINTER-FOREST', defaultVolume: 1},
}

export const FootStepSpeeds = {
    SNOW_WALK: 1.02,
    SNOW_RUN: 1.12,
    DIRT_WALK: 0.7,
    DIRT_RUN: 0.78,
}

export const WeaponSoundTypes = {
    SWORD: 'SWORD',
    BONE: 'BONE',
}

export const BodySoundTypes = {
    HARD: 'HARD',
    SOFT: 'SOFT',
    METAL: 'METAL',
}

export const MonsterSoundTypes = {
    SKELETON: 'SKELETON',
    CAT: 'CAT',
}
