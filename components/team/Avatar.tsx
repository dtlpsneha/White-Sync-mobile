import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { initials, personColor } from './chatUi';

/** A round initials badge in the person's own colour. */
export function Avatar({ name, size = 34 }: { name?: string | null; size?: number }) {
    const color = personColor(name);
    return (
        <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
            <Text style={[styles.text, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    circle: { justifyContent: 'center', alignItems: 'center' },
    text: { color: '#FFF', fontWeight: '800' },
});
