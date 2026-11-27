import { randomUUID } from 'node:crypto'
import { readdir, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { Format, NodeIO, Primitive } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { simplify } from '@gltf-transform/functions'
import draco from 'draco3dgltf'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

const modelsDir = fileURLToPath(new URL('../public/models/', import.meta.url))
const levels = [[2, 0.66], [3, 0.33]]
const defaultError = 0.05

async function* findModels(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name)
        if (entry.isDirectory()) yield* findModels(filename)
        else if (entry.isFile() && /\.(glb|gltf)$/i.test(entry.name) && !/_lod[23]\.(glb|gltf)$/i.test(entry.name)) {
            yield filename
        }
    }
}

function countTriangles(document) {
    let triangles = 0
    for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            const count = (primitive.getIndices() ?? primitive.getAttribute('POSITION')).getCount()
            switch (primitive.getMode()) {
                case Primitive.Mode.TRIANGLES:
                    triangles += Math.floor(count / 3)
                    break
                case Primitive.Mode.TRIANGLE_STRIP:
                case Primitive.Mode.TRIANGLE_FAN:
                    triangles += Math.max(0, count - 2)
                    break
            }
        }
    }
    return triangles
}

async function writeEmbeddedGltf(io, document) {
    const { json, resources } = await io.writeJSON(document, { format: Format.GLTF })
    for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) {
        const bytes = resources[resource.uri]
        if (!bytes) continue
        const mimeType = resource.mimeType ?? 'application/octet-stream'
        resource.uri = `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`
    }
    return JSON.stringify(json)
}

async function writeVariant(io, document, output) {
    await mkdir(path.dirname(output), { recursive: true })
    const temporary = path.join(path.dirname(output), `.${randomUUID()}.tmp`)
    try {
        const contents = output.endsWith('.gltf')
            ? await writeEmbeddedGltf(io, document)
            : await io.writeBinary(document)
        await writeFile(temporary, contents)
        await rename(temporary, output)
    } finally {
        await rm(temporary, { force: true })
    }
}

async function main() {
    const { values } = parseArgs({
        options: {
            help: { type: 'boolean', short: 'h' },
            output: { type: 'string' },
            error: { type: 'string' },
        },
    })
    if (values.help) {
        console.log('Usage: yarn generate:lod [--output <directory>] [--error <0–1>]')
        console.log(`Reads GLB and glTF files in public/models recursively. Defaults to writing beside the sources, with error ${defaultError}.`)
        return
    }

    const error = values.error === undefined ? defaultError : Number(values.error)
    if (values.error?.trim() === '' || !Number.isFinite(error) || error < 0 || error > 1) {
        throw new Error('--error must be a number from 0 to 1')
    }
    const outputDir = values.output ? path.resolve(values.output) : modelsDir
    const [decoder, encoder] = await Promise.all([
        draco.createDecoderModule(),
        draco.createEncoderModule(),
        MeshoptDecoder.ready,
        MeshoptEncoder.ready,
    ])
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
        'draco3d.decoder': decoder,
        'draco3d.encoder': encoder,
        'meshopt.decoder': MeshoptDecoder,
        'meshopt.encoder': MeshoptEncoder,
    })

    let models = 0
    let variants = 0
    let failures = 0
    for await (const source of findModels(modelsDir)) {
        models++
        const relative = path.relative(modelsDir, source)
        const { dir, name, ext } = path.parse(relative)
        for (const [level, ratio] of levels) {
            try {
                const document = await io.read(source)
                const before = countTriangles(document)
                await document.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error }))
                const after = countTriangles(document)
                const percentage = before ? ` (${(100 * after / before).toFixed(1)}%)` : ''
                const output = path.join(outputDir, dir, `${name}_lod${level}${ext.toLowerCase()}`)
                await writeVariant(io, document, output)
                console.log(`${relative} LOD${level}: ${before} -> ${after} triangles${percentage}`)
                variants++
            } catch (error) {
                console.error(`${relative} LOD${level}: ${error.message}`)
                failures++
            }
        }
    }
    console.log(`${models} models, ${variants} variants written, ${failures} failed.`)
    if (failures) process.exitCode = 1
}

main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
})
