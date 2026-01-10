import { Scene, Sound } from '@babylonjs/core'
import { Utils } from '@/utils/utils'

export const AudioManager = {
    BASE_PATH: './sounds/',
    BASE_PATH_SFX: './sounds/sfx/',
    BASE_PATH_MONSTER: './sounds/monster/',
    footStepSounds: new Map<string, Sound>(),
    deathRattleSounds: new Map<string, Sound>(),

    swordSwingSounds: [] as Sound[],
    swordHitHardSounds: [] as Sound[],
    swordHitMetalSounds: [] as Sound[],
    boneHitSounds: [] as Sound[],
    swordBlockSounds: [] as Sound[],

    initialize(scene: Scene) {
        this.footStepSounds.set(FootStepTypes.SNOW, new Sound("footStepSnow", AudioManager.BASE_PATH_SFX + "steps-snow.ogg", scene, function() {
            AudioManager.footStepSounds.get(FootStepTypes.SNOW)!['loaded'] = true;
        }, {
            volume: 0.6,
            playbackRate: 1,
            loop: true,
        }))

        this.footStepSounds.set(FootStepTypes.DIRT, new Sound("footStepDirt", AudioManager.BASE_PATH_SFX + "steps-dirt.ogg", scene, function() {
            AudioManager.footStepSounds.get(FootStepTypes.DIRT)!['loaded'] = true;
        }, {
            volume: 1.1,
            playbackRate: 1,
            loop: true,
        }))
        this.loadSoundArray(this.swordSwingSounds, ["swing1.ogg", "swing2.ogg", "swing3.ogg"], "swordSwingSound", scene, { volume: 1, playbackRate: 1 } );
        this.loadSoundArray(this.swordHitMetalSounds, ["hit-sword-metal1.ogg"], "swordHitMetalSound", scene, { volume: 0.5, playbackRate: 1 } );
        this.loadSoundArray(this.swordHitHardSounds, ["hit-sword-hard1.ogg", "hit-sword-hard2.ogg"], "swordHitHardSound", scene, { volume: 0.5, playbackRate: 1.1 } );
        this.loadSoundArray(this.swordBlockSounds, ["block-sword1.ogg", "block-sword2.ogg"], "swordBlockSound", scene, { volume: 0.5, playbackRate: 0.9 } );
        this.loadSoundArray(this.boneHitSounds, ["hit-bone1.ogg"], "boneHitSound", scene, { volume: 0.5, playbackRate: 1 } );

        // Death rattles
        this.loadDeathRattleSound(MonsterSoundTypes.SKELETON, "death-skeleton.ogg", scene, { volume: 1.2, playbackRate: 0.85 } );
    },

    loadSoundArray(targetArray: [Sound], fileNames: string[], soundName: string, scene: Scene, options: { volume: number, playbackRate: number }): Sound[] {
        fileNames.forEach((file, index) => {
            const sound = new Sound(soundName + index, AudioManager.BASE_PATH_SFX + file, scene, function() {
                sound['loaded'] = true;
            }, options);
            targetArray.push(sound);
        });
    },

    loadDeathRattleSound (type: string, fileName: string, scene: Scene, options: { volume: number, playbackRate: number }) {
        const sound = new Sound("deathRattle" + type, AudioManager.BASE_PATH_MONSTER + fileName, scene, function() {
            sound['loaded'] = true;
        }, options);
        this.deathRattleSounds.set(type, sound);
    },

    playWeaponSwing(type: string) {
        switch (type) {
            case WeaponSoundTypes.SWORD:
                this.playRandomSound(this.swordSwingSounds)
                break;
            case WeaponSoundTypes.BONE:
                this.playRandomSound(this.swordSwingSounds)
                break;
        }
    },

    playWeaponHit(weaponType: string, targetType: string) {
        switch (weaponType) {
            case WeaponSoundTypes.SWORD:

                switch (targetType) {
                    case BodySoundTypes.HARD:
                        this.playRandomSound(this.swordHitHardSounds)
                        break;
                    case BodySoundTypes.METAL:
                        this.playRandomSound(this.swordHitMetalSounds)
                        break;
                }
            case WeaponSoundTypes.BONE:
                this.playRandomSound(this.boneHitSounds)
                break
        }
    },

    playWeaponBlocked(targetType: string) {
        switch (targetType) {
            case WeaponSoundTypes.SWORD:
                this.playRandomSound(this.swordBlockSounds)
                break;
        }
    },

    playRandomSound(soundArray: Sound[]) {
        const sound = soundArray[Utils.rollDice(soundArray.length, true)];
        if (sound['loaded']) {
            sound.play();
        }
    },

    playDeathRattle(type: string) {
        const sound = this.deathRattleSounds.get(type)!
        if (sound['loaded']) {
            sound.play();
        }
    }
}

export const FootStepTypes = {
    SNOW: 'SNOW',
    DIRT: 'DIRT',
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
}
