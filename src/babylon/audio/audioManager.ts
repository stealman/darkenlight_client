import { Scene, Sound } from '@babylonjs/core'

export const AudioManager = {
    BASE_PATH: './sounds/',
    footStep: null as Sound,
    swordSounds: [] as Sound[],
    swingMissSounds: [] as Sound[],

    initialize(scene: Scene) {
        this.footStep = new Sound("footStep", AudioManager.BASE_PATH + "sfx/snowsteps.ogg", scene, function() {
            AudioManager.footStep['loaded'] = true;
        }, {
            volume: 0.4,
            playbackRate: 1,
            loop: true,
        });

        const swordSoundFiles = ["sfx/sword1.ogg", "sfx/sword2.ogg", "sfx/sword3.ogg", "sfx/sword4.ogg", "sfx/sword5.ogg"];
        swordSoundFiles.forEach((file, index) => {
            const swordSound = new Sound("swordSound" + index, AudioManager.BASE_PATH + file, scene, function() {
                swordSound['loaded'] = true;
            }, {
                volume: 0.7,
                playbackRate: 0.85,
            });
            this.swordSounds.push(swordSound);
        });

        const swingMissSoundFiles = ["sfx/swing1.ogg", "sfx/swing2.ogg", "sfx/swing3.ogg"];
        swingMissSoundFiles.forEach((file, index) => {
            const swingMissSound = new Sound("swingMissSound" + index, AudioManager.BASE_PATH + file, scene, function() {
                swingMissSound['loaded'] = true;
            }, {
                volume: 1,
                playbackRate: 1,
            });
            this.swingMissSounds.push(swingMissSound);
        });
    },

    playSwordSound() {
        if (this.swordSounds.length === 0) return;
        const randomIndex = Math.floor(Math.random() * this.swordSounds.length);
        const swordSound = this.swordSounds[randomIndex];
        if (swordSound['loaded']) {
            swordSound.play();
        }
    },

    playSwingMissSound() {
        if (this.swingMissSounds.length === 0) return;
        const randomIndex = Math.floor(Math.random() * this.swingMissSounds.length);
        const swingMissSound = this.swingMissSounds[randomIndex];
        if (swingMissSound['loaded']) {
            swingMissSound.play();
        }
    }
}

export const FootStepSpeeds = {
    SNOW_WALK: 1.02,
    SNOW_RUN: 1.12,
}
