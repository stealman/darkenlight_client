const fs = require('node:fs/promises')

const endpoint = '/admin-utils/equipment-modifiers.json'

function validateModifiers(value) {
    const object = v => v !== null && typeof v === 'object' && !Array.isArray(v)
    const transform = v => object(v) && ['position', 'rotation', 'scale'].every(key =>
        object(v[key]) && ['x', 'y', 'z'].every(axis => typeof v[key][axis] === 'number' && Number.isFinite(v[key][axis])))
    if (!object(value) || !object(value.equipment) || !object(value.pauldrons)) return false
    if (value.legs !== undefined && (!object(value.legs) || !Object.entries(value.legs).every(([id, v]) =>
        /^\d+$/.test(id) && object(v) && transform(v.left) && transform(v.right)))) return false
    if (value.weaponAttachment !== undefined && (!object(value.weaponAttachment)
        || !Array.isArray(value.weaponAttachment.correction) || value.weaponAttachment.correction.length !== 16
        || !value.weaponAttachment.correction.every(Number.isFinite))) return false
    return Object.entries(value.equipment).every(([id, v]) => /^\d+$/.test(id) && transform(v))
        && Object.entries(value.pauldrons).every(([id, v]) => /^\d+$/.test(id) && object(v) && transform(v.left) && transform(v.right))
}

function adminEquipmentModifiersPlugin(configPath) {
    return {
        name: 'admin-equipment-modifiers',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                if (req.url?.split('?')[0] !== endpoint || req.method !== 'PUT') return next()
                if (req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) {
                    res.writeHead(403).end('Invalid origin')
                    return
                }
                try {
                    let body = ''
                    for await (const chunk of req) {
                        body += chunk
                        if (body.length > 65536) {
                            res.writeHead(413).end('Configuration too large')
                            return
                        }
                    }
                    const config = JSON.parse(body)
                    if (!validateModifiers(config)) {
                        res.writeHead(400).end('Invalid equipment modifiers')
                        return
                    }
                    await fs.writeFile(configPath + '.tmp', JSON.stringify(config, null, 2) + '\n', 'utf8')
                    await fs.rename(configPath + '.tmp', configPath)
                    res.writeHead(204).end()
                } catch (error) {
                    server.config.logger.error(`Could not save equipment modifiers: ${error.message}`)
                    res.writeHead(500).end('Could not save equipment modifiers')
                }
            })
        },
    }
}

module.exports = { adminEquipmentModifiersPlugin, validateModifiers }
