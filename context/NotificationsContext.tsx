import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { File, Paths } from 'expo-file-system';
import { onSessionEnd } from '@/utils/sessionCache';

export interface PersistentNotification {
    id: string;
    title: string;
    body: string;
    data: any;
    timestamp: number;
    read: boolean;
}

interface NotificationsContextValue {
    notifications: PersistentNotification[];
    unreadCount: number;
    markAsRead: (id: string) => void;
    clearAll: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue>({
    notifications: [],
    unreadCount: 0,
    markAsRead: () => {},
    clearAll: () => {},
});

function getNotifFile() {
    return new File(Paths.document, 'notifications.json');
}

async function loadFromDisk(): Promise<PersistentNotification[]> {
    try {
        const file = getNotifFile();
        if (!file.exists) return [];
        const raw = await file.text();
        return JSON.parse(raw) as PersistentNotification[];
    } catch {
        return [];
    }
}

function saveToDisk(notifications: PersistentNotification[]): void {
    try {
        const file = getNotifFile();
        if (!file.exists) file.create();
        file.write(JSON.stringify(notifications));
    } catch (error) {
        console.error('[NotificationsContext] Failed to save:', error);
    }
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
    const [notifications, setNotifications] = useState<PersistentNotification[]>([]);
    const listenerRef = useRef<Notifications.Subscription | null>(null);
    const loadedRef = useRef(false);

    useEffect(() => {
        // Merge what was saved with anything that arrived while it loaded (replacing
        // used to drop one or the other), and only save once the load is done.
        loadFromDisk().then(saved => {
            setNotifications(prev => {
                const seen = new Set(prev.map(n => n.id));
                const merged = [...prev, ...saved.filter(n => !seen.has(n.id))].slice(0, 50);
                loadedRef.current = true;
                if (prev.length) saveToDisk(merged);
                return merged;
            });
        });

        // Another person signs in (or out): their alerts are not this person's.
        const offEnd = onSessionEnd(() => {
            saveToDisk([]);
            setNotifications([]);
        });

        listenerRef.current = Notifications.addNotificationReceivedListener(incoming => {
            const content = incoming.request.content;
            const notif: PersistentNotification = {
                id: incoming.request.identifier || `${Date.now()}`,
                title: content.title || 'New Notification',
                body: content.body || '',
                data: content.data || {},
                timestamp: Date.now(),
                read: false,
            };
            setNotifications(prev => {
                if (prev.some(n => n.id === notif.id)) return prev; // the same alert twice
                const updated = [notif, ...prev.slice(0, 49)]; // cap at 50
                if (loadedRef.current) saveToDisk(updated);
                return updated;
            });
        });

        return () => {
            listenerRef.current?.remove();
            offEnd();
        };
    }, []);

    const markAsRead = useCallback((id: string) => {
        setNotifications(prev => {
            const updated = prev.map(n => (n.id === id ? { ...n, read: true } : n));
            saveToDisk(updated);
            return updated;
        });
    }, []);

    const clearAll = useCallback(() => {
        saveToDisk([]);
        setNotifications([]);
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <NotificationsContext.Provider value={{ notifications, unreadCount, markAsRead, clearAll }}>
            {children}
        </NotificationsContext.Provider>
    );
}

export function useNotifications() {
    return useContext(NotificationsContext);
}
