/**
 * One clear pop-up when a sign-in or a part of the app is refused, so nobody is left with
 * an empty screen and no reason. Refusals arrive in bursts (a screen asks for several
 * things, Team Chat retries every few seconds), so they are gathered into one message and
 * each is shown once per sign-in.
 */
import { Alert } from 'react-native';
import { onSessionEnd } from '@/utils/sessionCache';

const shown = new Set<string>();
let waiting: string[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function showAccessAlert(message: string) {
    if (shown.has(message)) return;
    shown.add(message);
    waiting.push(message);
    if (timer) return;
    timer = setTimeout(() => {
        timer = null;
        const text = waiting.join('\n\n');
        waiting = [];
        if (text) Alert.alert('No access', `${text}\n\nPlease ask the admin to give you access.`);
    }, 800);
}

/** What ERPNext refused, in words: the DocType in the address, else the screen's data. */
export function refusedPart(url: string): string {
    const found = /\/api\/resource\/([^/?]+)/.exec(url) ?? /[?&]doctype=([^&]+)/.exec(url);
    if (!found) return 'You do not have access to some of the information on this screen.';
    let name = found[1];
    try { name = decodeURIComponent(name.replace(/\+/g, ' ')); } catch { /* keep as sent */ }
    return `You do not have access to ${name}.`;
}

// The next person to sign in is told about their own refusals afresh.
onSessionEnd(() => {
    shown.clear();
    waiting = [];
});
