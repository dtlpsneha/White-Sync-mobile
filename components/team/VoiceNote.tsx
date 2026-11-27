/**
 * A voice note in the chat: play / pause, how far along it is, and -- when SmartOps wrote it
 * out -- the same message in Tamil under the English (the English is the bubble's text
 * already), and the words as spoken when they are neither.
 * The recording loads with the SmartOps sign-in headers, like a posted photo.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { Colors } from '@/constants/theme';
import { team, Voice } from '@/services/teamApi';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function VoiceNote({ voice, colors, tint }: {
    voice: Voice; colors: typeof Colors.light; tint: string;
}) {
    const player = useAudioPlayer(null);
    const status = useAudioPlayerStatus(player);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let live = true;
        team.voiceSource(voice).then(src => {
            if (!live) return;
            player.replace(src);
            setReady(true);
        });
        return () => { live = false; };
    }, [voice, player]);

    // Back to the start once it has played through, so the next tap plays it again.
    useEffect(() => {
        if (status.didJustFinish) player.seekTo(0);
    }, [status.didJustFinish, player]);

    const toggle = () => {
        if (!ready) return;
        if (status.playing) player.pause(); else player.play();
    };
    const total = status.duration || 0;
    const done = total ? Math.min(1, status.currentTime / total) : 0;

    return (
        <View style={{ gap: 4 }}>
            <View style={styles.row}>
                <TouchableOpacity onPress={toggle} hitSlop={8}
                    style={[styles.play, { backgroundColor: tint, opacity: ready ? 1 : 0.5 }]}>
                    <Ionicons name={status.playing ? 'pause' : 'play'} size={18} color="#FFF"
                        style={status.playing ? undefined : { marginLeft: 2 }} />
                </TouchableOpacity>
                <View style={[styles.track, { backgroundColor: colors.border }]}>
                    <View style={[styles.fill, { width: `${done * 100}%`, backgroundColor: tint }]} />
                </View>
                <Text style={[styles.time, { color: colors.textSecondary }]}>
                    {clock(status.playing || status.currentTime ? status.currentTime : total)}
                </Text>
            </View>
            {voice.text == null && (
                <Text style={[styles.note, { color: colors.textSecondary }]}>Voice note — could not be written out</Text>
            )}
            {!!voice.tamil && voice.tamil !== voice.text && (
                <Text style={[styles.tamil, { color: colors.text }]}>{voice.tamil}</Text>
            )}
            {!!voice.said && voice.said !== voice.text && voice.said !== voice.tamil && (
                <Text style={[styles.note, { color: colors.textSecondary }]}>Said: {voice.said}</Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200 },
    play: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
    track: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
    fill: { height: 4 },
    time: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
    note: { fontSize: 12, fontStyle: 'italic' },
    tamil: { fontSize: 15, lineHeight: 22 },
});
