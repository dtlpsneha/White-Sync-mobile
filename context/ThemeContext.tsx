import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme as useNativeColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: 'light' | 'dark';
    mode: ThemeMode;
    setMode: (mode: ThemeMode) => void;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const systemColorScheme = useNativeColorScheme();
    const [mode, setModeState] = useState<ThemeMode>('system');
    const [theme, setTheme] = useState<'light' | 'dark'>(systemColorScheme || 'light');

    useEffect(() => {
        // Load persisted theme
        SecureStore.getItemAsync('user_theme_mode').then((savedMode) => {
            if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') {
                setModeState(savedMode as ThemeMode);
            }
        });
    }, []);

    useEffect(() => {
        if (mode === 'system') {
            setTheme(systemColorScheme || 'light');
        } else {
            setTheme(mode);
        }
    }, [mode, systemColorScheme]);

    const setMode = async (newMode: ThemeMode) => {
        setModeState(newMode);
        await SecureStore.setItemAsync('user_theme_mode', newMode);
    };

    const toggleTheme = () => {
        const newMode = theme === 'light' ? 'dark' : 'light';
        setMode(newMode);
    };

    return (
        <ThemeContext.Provider value={{ theme, mode, setMode, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
