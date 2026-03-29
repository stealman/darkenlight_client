import { Scene, PointerEventTypes, Vector3, PointerInfo} from '@babylonjs/core'
import {MyPlayer} from "@/data/myPlayer";
import { Settings } from '@/settings/settings'
import { ViewportManager } from '@/utils/viewport'
import { GMSceneManager } from '@/babylon/gm/GmSceneManager'
import { GMManager } from '@/gm/GM'
import { TargetingManager } from '@/gui/targettingManager'
import { AudioManager } from '@/babylon/audio/audioManager'
import { ActionButtonsManager } from '@/gui/actionButtonsManager'
import { GuiButtonsManager } from '@/gui/guiButtonsManager'

export const Controller = {
    leftPressedTime: 0,
    rightMousePressedTime: 0,

    lastDragMove: { x: 0, y: 0 },
    lastPointerMove: { x: 0, y: 0 },

    initializeController(scene: Scene) {
        scene.onPointerObservable.add((pointerInfo) => {

            // Touch device
            if (Settings.touchEnabled) {
                if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
                    this.leftPressedTime = new Date().getTime()
                    this.resolveLeftPressed(pointerInfo, scene)
                }
                if (pointerInfo.type === PointerEventTypes.POINTERUP) {

                }
            } else {
                // NO BUTTONS PRESSED
                if (GMManager.consumePointerMoveEvents && pointerInfo.event.buttons === 0) {
                    if (pointerInfo.type === PointerEventTypes.POINTERMOVE) {
                        this.resolvePointerMove(pointerInfo, scene)
                    }
                }

                // LEFT MOUSE PRESSED
                if (pointerInfo.event.buttons === 1) {
                    if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
                        if (GMManager.consumeLeftClickEvents) {
                            GMManager.onLeftClickEvent()
                        } else {
                            this.resolveLeftPressed(pointerInfo, scene)
                        }
                    }
                }

                // MIDDLE MOUSE BUTTON PRESSED
                if (pointerInfo.event.buttons === 4) {
                    if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
                        if (GMManager.consumeMiddleClickEvents) {
                            GMManager.onMiddleClickEvent()
                        }
                    }
                }

                // RIGHT MOUSE BUTTON DOWN
                if (pointerInfo.type === PointerEventTypes.POINTERDOWN && pointerInfo.event.button === 2) {
                    this.rightMousePressedTime = new Date().getTime()
                    this.resolveRightPresssed(pointerInfo)
                }

                // RIGHT MOUSE BUTTON UP
                if (pointerInfo.type === PointerEventTypes.POINTERUP && pointerInfo.event.button === 2) {
                    MyPlayer.stopMove()
                    this.rightMousePressedTime = 0
                }

                // MOUSE MOVE
                if (pointerInfo.type === PointerEventTypes.POINTERMOVE && pointerInfo.event.buttons === 2) {
                    this.resolveRightDrag(pointerInfo);
                }
            }
        })
    },

    processKeydown(e) {
        // I - open inventory
        if ((e.key && e.key.toLowerCase() === 'i') || e.code === 'KeyI') {
            if (e.repeat) return
            window.dispatchEvent(new CustomEvent('ui:open-inventory'))
            return
        }

        // C - open character dialog
        if ((e.key && e.key.toLowerCase() === 'c') || e.code === 'KeyC') {
            if (e.repeat) return
            window.dispatchEvent(new CustomEvent('ui:open-character'))
            return
        }

        // Space - click first available opportunity action
        if (e.code === 'Space' || e.keyCode === 32) {
            e.preventDefault()
            if (e.repeat) return
            GuiButtonsManager.clickFirstAvailableOpportunityButton()
            return
        }

        // Shift
        if (e.keyCode == 16) {GMManager.shiftPressed(true)}

        // TAB
        if (e.keyCode == 9) {
            AudioManager.playGuiButtonClick()
            e.preventDefault()
            TargetingManager.cycleThroughClosestTargets()
        }

        // F1 to F8
        if (e.keyCode >= 112 && e.keyCode <= 119) {
            e.preventDefault()
            if (e.repeat) return

            const index = e.keyCode - 111
            ActionButtonsManager.externalPressActionButton(index)
        }

        // ESCAPE
        if (e.keyCode == 27) {
            MyPlayer.onClickEscape()
        }
    },

    processKeyup(e) {
        // Shift
        if (e.keyCode == 16) {GMManager.shiftPressed(false)}

        // F1 to F8
        if (e.keyCode >= 112 && e.keyCode <= 119) {
            const index = e.keyCode - 111
            ActionButtonsManager.externalReleaseActionButton(index)
        }
    },

    resolveLeftPressed(pointerInfo, scene) {
        const { clientX, clientY } = pointerInfo.event
        const pick = scene.pick(clientX, clientY)
        if (!pick?.ray) return
        TargetingManager.resolvePickRay(pick.ray)
    },

    resolveRightPresssed(pointerInfo) {
        const myCharPosition = ViewportManager.getScreenPosition(MyPlayer.myModel!.model)
        const dx = pointerInfo.event.clientX - myCharPosition.x
        const dy = pointerInfo.event.clientY - myCharPosition.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        const angleRadians = Math.atan2(dy, dx)
        MyPlayer.startMove(distance > 150 ? 'R' : 'W', angleRadians)
    },

    resolveRightDrag(pointerInfo: PointerInfo) {
        this.resolveRightPresssed(pointerInfo)
    },

    resolvePointerMove(pointerInfo, scene) {
        const { clientX, clientY } = pointerInfo.event

        // if distance from last pointer move is less than 10px, ignore
        const dx = clientX - this.lastPointerMove.x
        const dy = clientY - this.lastPointerMove.y
        if (Math.sqrt(dx * dx + dy * dy) < 10) {
            return
        }

        const pickResult = scene.pick(clientX, clientY)
        if (pickResult && pickResult.hit && pickResult.pickedPoint) {
            GMSceneManager.updateHoverBlockMarker(pickResult.pickedPoint.x, pickResult.pickedPoint.z)
        }

        this.lastPointerMove = { x: clientX, y: clientY }
    },

    processJoystick(dx: number, dy: number) {
        if (dx === 0 && dy === 0) {
            MyPlayer.stopMove()
            return
        }

        // Translate joystick input to screen position
        const screenX = ViewportManager.viewportWidth / 2 + dx * (ViewportManager.viewportWidth / 2)
        const screenY = ViewportManager.viewportHeight / 2 + dy * (ViewportManager.viewportHeight / 2)

        const myCharPosition = ViewportManager.getScreenPosition(MyPlayer.myModel!.model)
        const deltaX = screenX - myCharPosition.x
        const deltaY = screenY - myCharPosition.y
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

        // If delta is too small, do not move
        if (distance < 10) {
            MyPlayer.stopMove()
            return
        }

        const angleRadians = Math.atan2(-deltaY, deltaX)
        MyPlayer.startMove(distance > 100 ? 'R' : 'W', angleRadians)
    },
}


