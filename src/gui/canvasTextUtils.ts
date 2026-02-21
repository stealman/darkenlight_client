
export const CanvasTextUtils = {
    drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tight: boolean, spacingFix = -1) {
        if (!tight) {
            ctx.fillText(text, x, y)
            return
        }
        ctx.textAlign = 'left'
        let cursorX = x
        for (const ch of text) {
            ctx.fillText(ch, cursorX, y)
            cursorX += ctx.measureText(ch).width + spacingFix
        }
    },

    getTextWidth(ctx: CanvasRenderingContext2D, text: string, tight: boolean, spacingFix = -1) {
        if (!tight) {
            return ctx.measureText(text).width
        }

        let w = 0
        for (const ch of text) {
            w += ctx.measureText(ch).width + spacingFix
        }
        return w
    },

    computeLetterSpacingFix(ctx: CanvasRenderingContext2D, font: string) {
        ctx.save()
        ctx.font = font

        const testStringWidth = this.getActualTextWidth(ctx, 'MMMMMMMM')
        const oneCharWidth = this.getActualTextWidth(ctx, 'M')

        ctx.restore()

        const diff = testStringWidth - (oneCharWidth * 8)
        const perCharDiff = (diff / 8) * window.devicePixelRatio

        // If perChar is between 15 and 25% of one character width, it is ok and return 0, otherwise return letter spacing fix to make it 20%
        if (perCharDiff < 0.15 * oneCharWidth || perCharDiff > 0.25 * oneCharWidth) {
            const fix = (0.2 * oneCharWidth) - perCharDiff
            return fix
        } else {
            return 0
        }
    },

    getActualTextWidth(ctx: CanvasRenderingContext2D, text: string) {
        const padding = 10
        const w = 300
        const h = 60

        const off = document.createElement('canvas')
        off.width = w
        off.height = h
        const c = off.getContext('2d')!

        c.clearRect(0, 0, w, h)
        c.font = ctx.font
        c.textBaseline = 'middle'
        c.textAlign = 'left'
        c.fillStyle = '#fff'

        c.fillText(text, padding, h / 2)

        const img = c.getImageData(0, 0, w, h).data

        let minX = w
        let maxX = 0

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4 + 3 // alpha
                if (img[i] > 0) {
                    minX = Math.min(minX, x)
                    maxX = Math.max(maxX, x)
                }
            }
        }

        return maxX > minX ? maxX - minX : 0
    }
}
