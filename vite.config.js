import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig(({ command }) => ({
    base: command === 'build' ? '/game/' : '/',
    plugins: [vue()],
    server: {
        host: true,
        historyApiFallback: true,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'), // '@' now maps to 'src'
        },
    },
}))
