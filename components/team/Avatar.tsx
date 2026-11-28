import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { initials, personColor, SMARTOPS_GREEN } from './chatUi';

/** A rounded initials tile in the person's own colour -- or, for SmartOps' own posts, its
 * badge, so a notice from SmartOps is never mistaken for a colleague's message. */
export function Avatar({ name, size = 34, smartops = false }: { name?: string | null; size?: number; smartops?: boolean }) {
    if (smartops) {
        return (
            <View style={[styles.circle, { width: size, height: size, borderRadius: Math.round(size * 0.31), backgroundColor: SMARTOPS_GREEN }]}>
                <Ionicons name="flash" size={size * 0.5} color="#FFF" />
            </View>
        );
    }
    const color = personColor(name);
    return (
        <View style={[styles.circle, { width: size, height: size, borderRadius: Math.round(size * 0.31), backgroundColor: color }]}>
            <Text style={[styles.text, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    circle: { justifyContent: 'center', alignItems: 'center' },
    text: { color: '#FFF', fontWeight: '800' },
});
