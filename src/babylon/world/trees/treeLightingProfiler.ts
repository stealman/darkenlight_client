import { EngineInstrumentation } from '@babylonjs/core'
import { ActiveMeshFreezer } from '@/babylon/scene/activeMeshFreezer'
import { Renderer } from '@/babylon/scene/renderer'
import { Settings } from '@/settings/settings'
import { TreeManager } from '../treeManager'
import type { TreeLightingProfileMode } from '../treeManager'
import { WorldRenderer } from '../worldRenderer'

const phases: readonly TreeLightingProfileMode[] = ['unlit', 'pbr', 'active-lights', 'pbr', 'active-lights', 'unlit']
const settleMs = 500
const sampleMs = 1400
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
let running = false

export async function profileTreeLighting() {
    const {engine, scene, instrumentation, camera} = Renderer
    if (running || !engine || !scene || !camera || !instrumentation || !Settings.treesEnabled) return
    running = true
    const gpu = new EngineInstrumentation(engine)
    const hasGpuTimer = !!engine.getCaps().timerQuery
    gpu.captureGPUFrameTime = hasGpuTimer
    gpu.captureShaderCompilationTime = true
    const startPosition = camera.globalPosition.clone()
    const rows: string[] = []
    const fpsByPhase: number[] = []

    try {
        for (const mode of phases) {
            if (scene.isDisposed || document.hidden) return
            const builds = gpu.shaderCompilationTimeCounter
            const initialBuilds = builds.count
            TreeManager.setLightingProfile(mode)
            WorldRenderer.refreshTreeRendering()
            ActiveMeshFreezer.invalidate()
            await wait(settleMs)
            if (scene.isDisposed || document.hidden) return

            let frames = 0, cpuMs = 0, draws = 0, frameStart = 0
            const gpuCounter = hasGpuTimer ? gpu.gpuFrameTimeCounter : undefined
            const gpuTotal = gpuCounter?.total ?? 0, gpuSamples = gpuCounter?.count ?? 0
            const warmedBuilds = builds.count
            const begin = engine.onBeginFrameObservable.add(() => { frameStart = performance.now() })
            const end = engine.onEndFrameObservable.add(() => {
                if (!frameStart) return
                frames++
                cpuMs += performance.now() - frameStart
                draws += instrumentation.drawCallsCounter.current
                frameStart = 0
            })
            const start = performance.now()
            await wait(sampleMs)
            const elapsed = performance.now() - start
            begin?.remove()
            end?.remove()
            if (!frames || scene.isDisposed || document.hidden) return

            const newGpuSamples = (gpuCounter?.count ?? 0) - gpuSamples
            const gpuMs = gpuCounter && newGpuSamples > 0 ? (gpuCounter.total - gpuTotal) / newGpuSamples / 1e6 : undefined
            const ms = (value: number) => value.toFixed(2)
            const fps = Math.round(1000 * frames / elapsed)
            fpsByPhase.push(fps)
            rows.push(`${mode}: ${fps} FPS | CPU ${ms(cpuMs / frames)} ms | GPU ${gpuMs === undefined ? 'n/a' : ms(gpuMs) + ' ms'}
  draws/frame ${ms(draws / frames)} | shader builds ${warmedBuilds - initialBuilds}+${builds.count - warmedBuilds}`)
        }
        const {renderer, version} = engine.getGlInfo()
        const moved = !camera.globalPosition.equalsWithEpsilon(startPosition, .1)
        return [`Tree lighting | ${Settings.deviceType} | ${Settings.detailLevel.name} | ${engine.getRenderWidth()}×${engine.getRenderHeight()}`,
            `FPS ${phases.join('/')}: ${fpsByPhase.join(' / ')}`,
            `${renderer || 'Unknown GPU'} | ${version || 'Unknown WebGL'} | camera moved: ${moved ? 'yes' : 'no'}`,
            ...rows].join('\n')
    } finally {
        gpu.captureGPUFrameTime = false
        gpu.captureShaderCompilationTime = false
        gpu.dispose()
        running = false
        if (!scene.isDisposed && Renderer.scene === scene) {
            TreeManager.setLightingProfile()
            WorldRenderer.refreshTreeRendering()
            ActiveMeshFreezer.invalidate()
        }
    }
}
