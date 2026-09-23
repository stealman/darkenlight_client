export const createPointerDoubleClickHandler = (singleClick: (key: any, pointer: {clientX: number, clientY: number}) => void, doubleClick: (key: any, pointer: {clientX: number, clientY: number}) => void, interval = 250) => {
    let lastTime = 0
    let lastKey: any = null
    let singleTimer: ReturnType<typeof setTimeout> | null = null

    const handler = (key: any, event?: PointerEvent) => {
        event?.preventDefault()
        const pointer = {clientX: event?.clientX ?? 0, clientY: event?.clientY ?? 0}
        const now = Date.now()
        const isDoubleClick = lastKey === key && (now - lastTime) <= interval

        if (isDoubleClick) {
            if (singleTimer) clearTimeout(singleTimer)
            singleTimer = null
            lastKey = null
            lastTime = 0
            doubleClick(key, pointer)
            return
        }

        lastKey = key
        lastTime = now
        if (singleTimer) clearTimeout(singleTimer)
        singleTimer = setTimeout(() => {
            singleClick(key, pointer)
            singleTimer = null
        }, interval)
    }

    handler.cancel = () => {
        if (singleTimer) clearTimeout(singleTimer)
        singleTimer = null
        lastKey = null
        lastTime = 0
    }
    return handler
}
