const path = require('node:path')
const {randomBytes} = require('node:crypto')
const {networkInterfaces} = require('node:os')

function isLocalAddress(address, interfaces = networkInterfaces()) {
    if (!address) return false
    const normalize = value => value.replace(/^::ffff:/i, '').split('%')[0].toLowerCase()
    const peer = normalize(address)
    if (peer === '::1' || /^127\./.test(peer)) return true
    return Object.values(interfaces).flat().some(entry => entry && normalize(entry.address) === peer)
}

function localGamePlugin(serverRoot, authoringEnabled = false) {
    const token = randomBytes(32).toString('hex')
    let io
    return {
        name: 'local-game-authoring',
        config(_, {command}) {
            return {define: {__AUTHORING_TOKEN__: JSON.stringify(command === 'serve' && authoringEnabled ? token : '')}}
        },
        configureServer(server) {
            server.middlewares.use('/__game_io', async (request, response) => {
                response.setHeader('Content-Type', 'application/json')
                if (!authoringEnabled) {
                    response.statusCode = 403
                    response.end(JSON.stringify({error: 'GM mode is disabled. Set VITE_GM_MODE=true in .env.local and restart yarn dev.'}))
                    return
                }
                const address = request.socket.remoteAddress
                if (!isLocalAddress(address)
                    || !['HEAD', 'POST'].includes(request.method) || request.headers['x-darkenlight-authoring'] !== token) {
                    response.statusCode = 403
                    response.end(JSON.stringify({error: 'GM authoring is only available on this PC.'}))
                    return
                }
                if (request.method === 'HEAD') {
                    response.statusCode = 204
                    response.end()
                    return
                }
                try {
                    if (!io) {
                        require(path.join(serverRoot, 'node_modules/ts-node')).register({project: path.join(serverRoot, 'tsconfig.json'), transpileOnly: true})
                        io = require(path.join(serverRoot, 'src/runtime/authoringIO.ts')).createAuthoringIO(
                            process.env.DARKENLIGHT_AUTHORING_ROOT || serverRoot,
                            process.env.DARKENLIGHT_AUTHORING_DB || 'darkenlight',
                        )
                    }
                    const parts = []
                    let length = 0
                    for await (const part of request) {
                        length += part.length
                        if (length > 40 * 1024 * 1024) throw new Error('Authoring request is too large')
                        parts.push(part)
                    }
                    response.end(await (await io).handle(Buffer.concat(parts).toString('utf8')))
                } catch (error) {
                    response.statusCode = 500
                    response.end(JSON.stringify({error: error.message}))
                }
            })
            server.httpServer?.once('close', () => { if (io) void io.then(service => service.close()).catch(console.error) })
        },
    }
}

module.exports = {localGamePlugin, isLocalAddress}
