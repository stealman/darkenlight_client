const {test} = require('node:test')
const assert = require('node:assert/strict')
const {readFileSync} = require('node:fs')
const {join} = require('node:path')
const ts = require('typescript')

const source = readFileSync(join(__dirname, '../src/babylon/world/outdoorInstanceBatch.ts'), 'utf8')
const moduleExports = {}
new Function('exports', ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
}).outputText)(moduleExports)
const {OutdoorInstanceBatch} = moduleExports

test('outdoor batches reuse visible slots, upload changed ranges and compact without drawing holes', () => {
    const gpu = new Map()
    const cpu = new Map()
    const uploads = []
    const mesh = {
        _thinInstanceDataStorage: {},
        thinInstanceCount: 0,
        thinInstanceSetBuffer(kind, data) {
            cpu.set(kind, data)
            gpu.set(kind, data.slice())
            if (kind === 'matrix') this._thinInstanceDataStorage.worldMatrices = null
        },
        setEnabled(enabled) { this.enabled = enabled },
        getVertexBuffer(kind) { return {getBuffer: () => kind === 'world0' ? 'matrix' : kind} },
        getEngine() {
            return {updateDynamicVertexBuffer(kind, values, offset) {
                gpu.get(kind).set(values, offset / 4)
                uploads.push({kind, offset, length: values.length})
            }}
        },
    }
    const batch = new OutdoorInstanceBatch(mesh)
    const make = id => ({
        batch, slot: -1,
        matrix: {id, copyToArray: (buffer, offset) => buffer.fill(id, offset, offset + 16)},
        uv: {x: id, y: -id},
        attributes: [{kind: 'field', stride: 3, values: [0, 0, 0, id, id + 1, id + 2]}],
        index: 1,
    })
    const first = Array.from({length: 28}, (_, i) => make(i + 1))
    first.forEach(instance => batch.add(instance))
    batch.flush()
    assert.equal(mesh.thinInstanceCount, 28)
    mesh._thinInstanceDataStorage.worldMatrices = first.map(instance => instance.matrix)

    const incoming = make(99)
    batch.remove(first[4])
    batch.add(incoming)
    batch.flush()
    assert.equal(incoming.slot, 4)
    assert.equal(first[5].slot, 5)
    assert.equal(gpu.get('matrix')[4 * 16], 99)
    assert.equal(cpu.get('matrix')[4 * 16], 99)
    assert.equal(mesh._thinInstanceDataStorage.worldMatrices[4], incoming.matrix)
    assert.deepEqual(uploads, [
        {kind: 'matrix', offset: 4 * 16 * 4, length: 16},
        {kind: 'uvc', offset: 4 * 2 * 4, length: 2},
        {kind: 'field', offset: 4 * 3 * 4, length: 3},
    ])
    uploads.length = 0
    batch.flush()
    assert.equal(uploads.length, 0)

    // Both the vacated slot and the first tail instance are leaving.
    batch.remove(first[3])
    batch.remove(first[27])
    batch.flush()
    assert.equal(mesh.thinInstanceCount, 26)
    assert.equal(gpu.get('matrix')[3 * 16], first[26].matrix.id)
    assert.equal(mesh._thinInstanceDataStorage.worldMatrices.length, 26)
    const remaining = first.filter(instance => instance.slot !== -1).concat(incoming)
    const appended = Array.from({length: 8}, (_, i) => make(100 + i))
    for (const instance of appended) batch.add(instance)
    batch.flush()
    assert.equal(mesh.thinInstanceCount, 34)
    assert.equal(gpu.get('matrix')[incoming.slot * 16], 99)
    assert.equal(gpu.get('uvc')[appended[7].slot * 2], 107)
    assert.equal(gpu.get('field')[appended[7].slot * 3 + 2], 109)
    for (const instance of remaining.concat(appended)) batch.remove(instance)
    batch.flush()
    assert.equal(mesh.thinInstanceCount, 0)
    assert.equal(mesh.enabled, false)
})
