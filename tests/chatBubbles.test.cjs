const assert = require('node:assert/strict')
const {test} = require('node:test')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
function setup() {
    const bob = {id: 2, name: 'Bob'}, eve = {id: 3, name: 'Eve'}
    const characters = {characters: new Map([[2,bob],[3,eve]]), visibleCharacters: new Set([2])}
    const painted = []
    const raster = () => ({canvas: {}, ctx: {setTransform() {}, beginPath() {}, roundRect() {}, fill() {},
        fillText(text) {painted.push({text, color: this.fillStyle})}}})
    const deps = {
        '@/babylon/character/characterManager': {CharacterManager: characters},
        '@/data/myPlayer': {MyPlayer: {myChar: {id: 1, name: 'Alice'}}},
        '@/gui/canvasTextUtils': {CanvasTextUtils: {getTextWidth: (ctx, text) => text.length * 6}, createOverlayRaster: raster},
    }
    const source = fs.readFileSync(require('node:path').join(__dirname, '../src/gui/overlay/overlayLabels.ts'), 'utf8')
    const exports = {}
    vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText, {
        exports, require: name => deps[name] || {}, window: {devicePixelRatio: 1}, document: {documentElement: {}},
        getComputedStyle: () => ({getPropertyValue: token => token === '--ui-accent-purple' ? '164, 132, 193' : '119, 171, 125'}),
    })
    return {labels: new exports.OverlayLabels({ctx: {}, fontSize: 16}), bob, characters, painted}
}
const entry = (channel, from = 'Bob') => ({id: 'm', channel, from, to: 'Alice', text: 'Hello there', time: Date.now()})
test('visible private and party senders produce purple and green speech bubbles', () => {
    const s = setup()
    s.labels.addChatSpeech(entry('private'))
    s.labels.addChatSpeech(entry('party'))
    const bubbles = s.labels.speech.get(s.bob)
    assert.equal(bubbles.length, 2)
    assert.equal(bubbles[0].color, 'rgb(164, 132, 193)')
    assert.equal(bubbles[1].color, 'rgb(119, 171, 125)')
    assert.equal(s.painted[0].text, 'Hello there')
    assert.equal(s.painted[0].color, bubbles[0].color)
    bubbles[0].image = null
    s.labels.prepareSpeechBubble(bubbles[0])
    assert.equal(s.painted.at(-1).color, bubbles[0].color)
})
test('offscreen, distant, own and public messages do not create private/party bubbles', () => {
    const s = setup()
    s.labels.addChatSpeech(entry('private', 'Eve'))
    s.labels.addChatSpeech(entry('party', 'Distant player'))
    s.labels.addChatSpeech(entry('party', 'Alice'))
    s.labels.addChatSpeech(entry('public'))
    assert.equal(s.labels.speech.size, 0)
    s.characters.visibleCharacters.clear()
    s.labels.addChatSpeech(entry('private'))
    assert.equal(s.labels.speech.size, 0)
})
test('private bubbles preserve messages longer than the public speech limit', () => {
    const s = setup(), message = entry('private')
    message.text = 'Word '.repeat(60).trim()
    s.labels.addChatSpeech(message)
    assert.equal(s.labels.speech.get(s.bob)[0].lines.join(' '), message.text)
})
