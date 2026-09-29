import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import path from 'path'

function collectPngPaths(directory, publicPath) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(directory, entry.name)
        const entryPublicPath = `${publicPath}/${entry.name}`

        if (entry.isDirectory()) {
            return collectPngPaths(entryPath, entryPublicPath)
        }
        return entry.isFile() && path.extname(entry.name).toLowerCase() === '.png'
            ? [entryPublicPath]
            : []
    })
}

export default defineConfig(({ mode }) => {
    const isTauriBuild = mode === 'tauri'
    const steelArmorImagePaths = collectPngPaths(
        path.resolve(__dirname, 'public/images/items/armor'),
        '/images/items/armor',
    ).filter((imagePath) => path.posix.basename(imagePath).startsWith('steel-'))
    const pixelatedImagePaths = [
        ...collectPngPaths(path.resolve(__dirname, 'public/images/icons'), '/images/icons'),
        ...collectPngPaths(path.resolve(__dirname, 'public/images/items/resources'), '/images/items/resources'),
        ...steelArmorImagePaths,
    ]

    return {
    base: '/',
    define: {
        __PIXELATED_IMAGE_PATHS__: JSON.stringify(pixelatedImagePaths),
    },
    plugins: [
        vue(),
        !isTauriBuild && VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.js',
            registerType: 'prompt',
            includeAssets: [
                'icons/darkenlight-64.png',
                'icons/darkenlight-180.png',
                'icons/darkenlight-192.png',
                'icons/darkenlight-512.png',
                'icons/darkenlight-maskable-512.png',
            ],
            manifest: {
                name: 'Darkenlight',
                short_name: 'Darkenlight',
                description: 'Darkenlight je online fantasy MMORPG.',
                theme_color: '#0b1523',
                background_color: '#0b1523',
                display: 'standalone',
                start_url: '/',
                scope: '/',
                lang: 'cs',
                icons: [
                    { src: 'icons/darkenlight-192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'icons/darkenlight-512.png', sizes: '512x512', type: 'image/png' },
                    { src: 'icons/darkenlight-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
            },
            injectManifest: {
                globPatterns: ['**/*.{js,css,html,json,woff,woff2,ttf,eot}'],
                maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
            },
        }),
    ].filter(Boolean),
    server: {
        host: true,
        historyApiFallback: true,
        watch: {
            // Tauri writes generated Rust files while running; they are not frontend sources.
            ignored: ['**/src-tauri/**'],
        },
    },
    resolve: {
        alias: [
            {
                find: '@/pwa/register',
                replacement: path.resolve(__dirname, isTauriBuild ? './src/pwa/registerDesktop.ts' : './src/pwa/register.ts'),
            },
            { find: '@', replacement: path.resolve(__dirname, './src') },
        ],
    },
}})
