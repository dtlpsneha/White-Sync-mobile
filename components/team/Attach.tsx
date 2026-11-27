/**
 * Picking the one photo or PDF a post or reply carries -- camera, gallery or a file.
 * Shared by the composer and the reply bar so both ask for permission the same way.
 */

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { PickedFile } from '@/services/teamApi';

export async function takePhoto(): Promise<PickedFile | null> {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
        Alert.alert('Camera', 'Allow the camera in Settings to take a photo of the PO.');
        return null;
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    return r.canceled ? null : { uri: r.assets[0].uri, name: r.assets[0].fileName, mimeType: r.assets[0].mimeType };
}

export async function choosePhoto(): Promise<PickedFile | null> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
        Alert.alert('Photos', 'Allow photo access in Settings to attach a picture.');
        return null;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    return r.canceled ? null : { uri: r.assets[0].uri, name: r.assets[0].fileName, mimeType: r.assets[0].mimeType };
}

export async function chooseFile(): Promise<PickedFile | null> {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    return r.canceled ? null : { uri: r.assets[0].uri, name: r.assets[0].name, mimeType: r.assets[0].mimeType };
}

/** Ask where the attachment comes from. */
export function pickAttachment(onPicked: (f: PickedFile) => void): void {
    const run = (fn: () => Promise<PickedFile | null>) => async () => {
        try {
            const f = await fn();
            if (f) onPicked(f);
        } catch (e: any) {
            Alert.alert('Attach', `Could not attach: ${e?.message || e}`);
        }
    };
    Alert.alert('Attach', 'Add a photo or a PDF', [
        { text: 'Camera', onPress: run(takePhoto) },
        { text: 'Gallery', onPress: run(choosePhoto) },
        { text: 'PDF / file', onPress: run(chooseFile) },
        { text: 'Cancel', style: 'cancel' },
    ]);
}
