<template>
    <div class="dialog-backdrop">
        <div class="dialog-window">
            <div class="dialog-header">
                {{ t('login.guestTitle') }}
            </div>
            <div class="dialog-content">
                <table>
                    <tbody>
                    <tr>
                        <td class="item-label" style="width: 25%">{{ t('login.name') }}</td>
                        <td style="width: 25%">
                            <input id="username" style="color: var(--ui-text);" v-model="charName" type="text" @keydown="clearLoginAndPassword" />
                        </td>
                    </tr>
                    </tbody>
                </table>
            </div>

            <div class="dialog-header" style="margin-top: 2vh;">
                {{ t('login.accountTitle') }}
            </div>
            <div class="dialog-content">
                <table>
                    <tbody>
                    <tr>
                        <td class="item-label" style="width: 25%">{{ t('login.login') }}</td>
                        <td style="width: 25%">
                            <input style="color: var(--ui-text);" v-model="login" type="text" @keydown="clearCharName" />
                        </td>
                    </tr>

                    <tr>
                        <td class="item-label" style="width: 25%">{{ t('login.password') }}</td>
                        <td style="width: 25%">
                            <div class="relative mt-2">
                                <input style="color: var(--ui-text);" type="password" v-model="password" />
                            </div>
                        </td>
                    </tr>

                    <tr>
                        <td class="item-label" style="width: 25%">{{ t('login.rememberMe') }}</td>
                        <td style="width: 25%">
                            <Checkbox name="remember-me" input-id="rememberme" v-model="rememberMe" binary />
                        </td>
                    </tr>

                    <tr v-if="rememberMe">
                        <td class="item-label" style="width: 25%">{{ t('login.autoLogin') }}</td>
                        <td style="width: 25%">
                            <Checkbox name="remember-me" input-id="autologin" v-model="autoLogin" binary />
                        </td>
                    </tr>
                    </tbody>
                </table>
            </div>

            <div class="dialog-actions" style="margin-top: 20px;">
                <button class="dialog-button" @click="doLogin()">{{ t('login.submit') }}</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { Connector } from '@/network/connector'
import { useI18n } from '@/i18n'

let rememberMe = ref(false)
let autoLogin = ref(false)
const login = ref('')
const password = ref('')
const charName = ref('')

const emit = defineEmits(['login'])
const { t } = useI18n()

onMounted(() => {
    const loginForm = localStorage.getItem('DARKENLIGHT_LOGIN_FORM')
    if (loginForm) {
        const form = JSON.parse(loginForm)
        login.value = form.login
        password.value = form.password
        charName.value = form.charName
        rememberMe.value = form.rememberMe
        autoLogin.value = form.autoLogin
    }
})

const doLogin = () => {
    const form = {
        login: login.value,
        password: password.value,
        charName: charName.value,
        rememberMe: rememberMe.value,
        autoLogin: rememberMe.value && autoLogin.value
    }

    if (form.rememberMe) {
        localStorage.setItem('DARKENLIGHT_LOGIN_FORM', JSON.stringify(form))
    } else {
        localStorage.removeItem('DARKENLIGHT_LOGIN_FORM')
    }

    if (form.login && form.password) {
        Connector.sendLoginRequest(form.login, form.password)
        emit('login')
    } else if (form.charName) {
        Connector.sendLoginRequest(undefined, undefined, form.charName)
        emit('login')
    } else {
        alert(t('login.missingCredentials'))
    }
}

const clearCharName = () => {
    charName.value = ''
}

const clearLoginAndPassword = () => {
    login.value = ''
    password.value = ''
}
</script>

<style>
</style>
