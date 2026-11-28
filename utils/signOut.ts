/**
 * Ends the session on this phone. Every sign-out path uses this, so none of them
 * forgets a key (the Home and Profile logouts used to differ).
 */
import * as SecureStore from 'expo-secure-store';
import { apiPost } from '@/utils/api';
import { apiUrl } from '@/constants/config';
import { clearSessionCaches } from '@/utils/sessionCache';
import { endSmartOpsSession } from '@/services/teamApi';

const KEYS = ['session_cookies', 'user_name', 'is_manager', 'show_all_quotes', 'user_id', 'last_seen_pending_ids',
    'smartops_token', 'team_seen_mine'];

/**
 * @param tellServer  true for a sign-out the person chose: ERPNext also ends the session,
 *                    so the old cookie stops working. false when the session already ended.
 */
export async function signOut(tellServer = true): Promise<void> {
    if (tellServer) {
        try {
            const cookies = await SecureStore.getItemAsync('session_cookies');
            if (cookies) await apiPost(apiUrl('/api/method/logout'), {}, cookies);
        } catch { /* signing out on the phone must not depend on the network */ }
    }
    await endSmartOpsSession().catch(() => undefined);
    await Promise.all(KEYS.map(k => SecureStore.deleteItemAsync(k).catch(() => undefined)));
    clearSessionCaches();
}
