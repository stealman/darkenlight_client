const {test} = require('node:test')
const assert = require('node:assert/strict')
const {isLocalAddress, localGamePlugin} = require('../build/localGame.cjs')

test('GM bridge accepts loopback and this PC network interfaces, including IPv4-mapped addresses', () => {
    const interfaces = {Ethernet: [{address: '192.168.0.227'}, {address: 'fe80::1234%12'}]}
    for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '192.168.0.227', '::ffff:192.168.0.227', 'fe80::1234%12']) {
        assert.equal(isLocalAddress(address, interfaces), true, address)
    }
    for (const address of [undefined, '', '192.168.0.228', '10.0.0.1', '::ffff:192.168.0.228']) {
        assert.equal(isLocalAddress(address, interfaces), false, String(address))
    }
})

test('GM authoring is opt-in and never includes its token in a release build', async () => {
    assert.equal(localGamePlugin('.').config({}, {command: 'serve'}).define.__AUTHORING_TOKEN__, '""')
    assert.equal(localGamePlugin('.', true).config({}, {command: 'build'}).define.__AUTHORING_TOKEN__, '""')
    assert.notEqual(localGamePlugin('.', true).config({}, {command: 'serve'}).define.__AUTHORING_TOKEN__, '""')
    let middleware
    localGamePlugin('.').configureServer({middlewares: {use(path, handler) { middleware = handler }}})
    let body
    const response = {setHeader() {}, end(value) { body = JSON.parse(value) }}
    await middleware({}, response)
    assert.equal(response.statusCode, 403)
    assert.match(body.error, /VITE_GM_MODE=true/)
})
