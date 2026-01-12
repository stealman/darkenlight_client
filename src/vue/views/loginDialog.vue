<template>
    <div class="dialog-backdrop" >
        <div class="dialog-window">
            <div class="dialog-header">
                Přihlášit jako host
            </div>
            <div class="dialog-content">
                <table>
                    <tbody>
                    <tr>
                        <td class="item-label" style="width: 25%">Jméno</td>
                        <td  style="width: 25%">
                            <input id="username" v-model="charName" type="text" @keydown="clearLoginAndPassword" />
                        </td>
                    </tr>
                    </tbody>
                </table>
            </div>

            <div class="dialog-header" style="margin-top: 2vh;">
                Přihlásit účtem
            </div>
            <div class="dialog-content">
                <table>
                    <tbody>
                    <tr>
                        <td class="item-label" style="width: 25%">Login</td>
                        <td  style="width: 25%">
                            <input v-model="login" type="text" @keydown="clearCharName" />
                        </td>
                    </tr>

                    <tr>
                        <td class="item-label" style="width: 25%">Heslo</td>
                        <td  style="width: 25%">
                            <div class="relative mt-2">
                                <input type="password" v-model="password" />
                            </div>
                        </td>
                    </tr>

                    <tr>
                        <td class="item-label" style="width: 25%">Zapamatovat přihlášení</td>
                        <td  style="width: 25%">
                            <Checkbox name="remember-me" input-id="rememberme" v-model="rememberMe" binary />
                        </td>
                    </tr>

                    <tr v-if="rememberMe">
                        <td class="item-label" style="width: 25%">Automaticky přihlásit</td>
                        <td  style="width: 25%">
                            <Checkbox name="remember-me" input-id="autologin" v-model="autoLogin" binary />
                        </td>
                    </tr>
                    </tbody>
                </table>
            </div>

            <div class="dialog-actions" style="margin-top: 20px;">
                <button class="dialog-button" @click="doLogin()">Přihlásit</button>
            </div>

        </div>
    </div>
</template>

<script setup>

import { onMounted, ref } from 'vue'
import { Connector } from '@/network/connector'

let rememberMe = ref(false)
let autoLogin = ref(false)
const login = ref('')
const password = ref('')
const charName = ref('')

const emit = defineEmits(['login'])

onMounted(() => {
    const loginForm = localStorage.getItem("LOGIN_FORM")
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
        localStorage.setItem("LOGIN_FORM", JSON.stringify(form));
    } else {
        localStorage.removeItem("LOGIN_FORM");
    }

    if (form.login && form.password) {
        Connector.sendLoginRequest(form.login, form.password)
        emit('login');
    } else if (form.pilotName) {
        Connector.sendLoginRequest(undefined, undefined, form.charName)
        emit('login');
    } else {
        alert("Zadejte přihlašovací jméno nebo jméno pilota");
        return;
    }
}

const clearCharName = () => {
    charName.value = '';
}

const clearLoginAndPassword = () => {
    login.value = '';
    password.value = '';
}

</script>

<style>

</style>
