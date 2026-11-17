const {test} = require('node:test')
const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const ts = require('typescript')
const vm = require('node:vm')

test('reloading gathering sound banks replaces disposed sounds and every random variant plays', () => {
    let selected = 0
    const callbacks = []
    class Sound {
        constructor(name, url, scene, ready) {
            Object.assign(this, {name, scene, plays: 0})
            callbacks.push(ready)
        }
        setVolume() {}
        setPlaybackRate() {}
        play() { assert.equal(this.scene.disposed, false); this.plays++ }
    }
    const exports = {}
    const dependencies = {
        '@babylonjs/core': {Sound},
        '@/utils/utils': {Utils: {rollDice: () => selected}},
        '@/babylon/audio/audioUtils': {AudioUtils: {getVolumeRatioByDistance: () => 1}},
    }
    vm.runInNewContext(ts.transpileModule(readFileSync(join(__dirname, '../src/babylon/audio/audioManager.ts'), 'utf8'), {
        compilerOptions: {module: ts.ModuleKind.CommonJS},
    }).outputText, {exports, require: name => dependencies[name] || {}})
    const manager = exports.AudioManager
    const files = ['one.ogg', 'two.ogg', 'three.ogg', 'four.ogg']
    for (const [bank, play] of [[manager.miningSounds, 'playMiningSound'], [manager.lumberJackingSounds, 'playLumberJackingSound']]) {
        let previous
        for (let generation = 0; generation < 4; generation++) {
            if (previous) previous.disposed = true
            const scene = {disposed: false}
            manager.loadSoundArray(bank, files, 'gathering', scene, {volume: 1, playbackRate: 1})
            callbacks.splice(0).forEach(ready => ready())
            assert.equal(bank.length, files.length)
            for (selected = 0; selected < files.length; selected++) manager[play]({})
            assert.ok(bank.every(sound => sound.scene === scene && sound.plays === 1))
            previous = scene
        }
    }
})
