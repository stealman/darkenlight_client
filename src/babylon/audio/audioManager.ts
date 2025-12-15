import { Scene, Sound } from '@babylonjs/core'

export const AudioManager = {
    BASE_PATH: './public/sounds/',
    footStep: null as Sound,

    initialize(scene: Scene) {
        this.footStep = new Sound("footStep", AudioManager.BASE_PATH + "sfx/footstep2.wav", scene, function() {
            AudioManager.footStep['loaded'] = true;
        }, {
            volume: 0.5,
            playbackRate: 1,
            loop: true,
        });
    },
}
