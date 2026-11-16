const {test} = require('node:test')
const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const ts = require('typescript')

test('clock display counts midnight rollover and preserves day after world resynchronization', () => {
    let now = 0
    const exports = {}
    const dependencies = {
        '@babylonjs/core': {Color3: class {}},
        '@/babylon/scene/lighting/lightConfig': {INITIAL_DAY_NIGHT_PHASE: 0, DEFAULT_DAY_NIGHT_CYCLE_DURATION_MS: 3600000},
    }
    const source = readFileSync(join(__dirname, '../src/babylon/scene/lighting/dayNightLighting.ts'), 'utf8')
    new Function('exports', 'require', 'performance', ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    }).outputText)(exports, name => dependencies[name] || {}, {now: () => now})
    const host = {sunLight: null}
    exports.resetDayNightLighting(host)
    const sync = {day: 7, phase: 12.5 / 24, cycleDurationMs: 3600000, paused: true}
    exports.synchronizeDayNightCycle(host, sync)
    assert.equal(exports.getGameTimeInfo(host).day, 7)
    assert.equal(exports.getGameTimeInfo(host).time, '12:30')
    now += 100000
    assert.equal(exports.getGameTimeInfo(host).time, '12:30')
    exports.synchronizeDayNightCycle(host, {...sync, phase: 23 / 24, paused: false})
    now += 3600000 / 24
    assert.equal(exports.getGameTimeInfo(host).day, 8)
    assert.equal(exports.getGameTimeInfo(host).time, '00:00')
    exports.synchronizeDayNightCycle(host, {day: 8, phase: 0, cycleDurationMs: 3600000})
    assert.equal(exports.getGameTimeInfo(host).day, 8)
    assert.equal(exports.getGameTimeInfo(host).time, '00:00')
})
