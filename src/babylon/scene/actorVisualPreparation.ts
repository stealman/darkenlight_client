import type { Scene } from '@babylonjs/core'

const FRAME_BUDGET_MS = 5
const MAX_WAIT_MS = 100
type ActorPreparation = {queuedAt: number, run: () => void, cancel?: () => void}
const activeQueues = new WeakMap<Scene, ActorPreparation[]>()

export function startActorVisualPreparation(scene: Scene) {
    if (activeQueues.has(scene)) return
    const queue: ActorPreparation[] = []
    activeQueues.set(scene, queue)
    scene.onDisposeObservable.addOnce(() => {
        activeQueues.delete(scene)
        for (const task of queue.splice(0)) task.cancel?.()
    })
}

export function enqueueActorVisualPreparation(scene: Scene, run: () => void) {
    const queue = activeQueues.get(scene)
    if (!queue) return false
    queue.push({queuedAt: performance.now(), run})
    return true
}

export function waitForActorVisualPreparation(scene: Scene) {
    const queue = activeQueues.get(scene)
    if (!queue) return undefined
    return new Promise<void>(resolve => queue.push({queuedAt: performance.now(), run: resolve, cancel: resolve}))
}

export function flushActorVisualPreparation(scene: Scene, startedAt: number) {
    const queue = activeQueues.get(scene)
    const next = queue?.[0]
    if (!next) return
    const now = performance.now()
    if (now - startedAt > FRAME_BUDGET_MS && now - next.queuedAt < MAX_WAIT_MS) return
    queue!.shift()
    next.run()
}
