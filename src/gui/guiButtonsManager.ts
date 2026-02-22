export const GuiButtonsManager = {
    size: 32 as number,
    btnBackpack: null as HTMLButtonElement,

    initialize() {
        this.btnBackpack = document.getElementById("btn-backpack") as HTMLButtonElement
        this.setSize(this.size)
    },

    updatePositions(miniMapSize: number) {
        this.btnBackpack.style.right = `${miniMapSize + 5}px`
        this.btnBackpack.style.top = `5px`
    },

    setSize(size: number) {
        this.size = size

        if (this.btnBackpack == null) return
        this.btnBackpack.style.width = `${size}px`
        this.btnBackpack.style.height = `${size}px`
    }
}
