/**
 * "What is this file?" -- asked when a file is attached in Team Chat. Pick the document type,
 * then fill the few fields that type asks for (customer, number, date, amount...). The types
 * and their fields come from SmartOps (`team.documentTypes`), so this draws whatever it is given.
 *
 * Mount it only while it is open (`{open && <FileTypeSheet ... />}`): it starts from
 * `initial` each time, with nothing left over from the last file.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { searchCustomers, searchSuppliers } from '@/services/frappeSearch';
import { DocField, DocType, Filing } from '@/services/teamApi';
import { Sheet } from './Sheet';

type Values = Record<string, string>;
type Match = { id: string; name: string };

const isoOf = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('-') : iso);

export function FileTypeSheet({ types, initial, fileName, saving, onSave, onClose }: {
    types: DocType[];
    initial?: Filing | null;
    fileName?: string | null;
    saving?: boolean;
    onSave: (filing: Filing) => void;
    onClose: () => void;
}) {
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];
    const [typeKey, setTypeKey] = useState<string | null>(initial?.doc_type ?? null);
    const [values, setValues] = useState<Values>(initial?.details ?? {});
    const type = types.find(t => t.key === typeKey) ?? null;

    const set = (key: string, value: string) => setValues(v => ({ ...v, [key]: value }));

    const save = () => {
        if (!type) return;
        const missing = type.fields.find(f => f.required && !(values[f.key] || '').trim());
        if (missing) return; // the button says what is missing
        const details: Values = {};
        for (const f of type.fields) {
            const v = (values[f.key] || '').trim();
            if (v) details[f.key] = v;
            if (v && values[`${f.key}_id`]) details[`${f.key}_id`] = values[`${f.key}_id`];
        }
        onSave({ doc_type: type.key, details });
    };

    const missing = type?.fields.find(f => f.required && !(values[f.key] || '').trim());

    return (
        <Sheet visible title="What is this file?" subtitle={fileName || undefined} onClose={onClose}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Document type</Text>
            <View style={styles.types}>
                {types.map(t => {
                    const on = t.key === typeKey;
                    return (
                        <TouchableOpacity key={t.key} onPress={() => setTypeKey(t.key)} activeOpacity={0.8}
                            style={[styles.type, {
                                borderColor: on ? colors.primary : colors.border,
                                backgroundColor: on ? colors.primary : colors.background,
                            }]}>
                            <Ionicons name={t.icon as any} size={16} color={on ? '#FFF' : colors.primary} />
                            <Text style={[styles.typeText, { color: on ? '#FFF' : colors.text }]}>{t.label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {type?.fields.map(f => (
                <FieldInput key={`${type.key}-${f.key}`} field={f} values={values} set={set} colors={colors} />
            ))}

            <TouchableOpacity disabled={!type || !!missing || saving} onPress={save}
                style={[styles.save, { backgroundColor: colors.primary, opacity: !type || missing ? 0.5 : 1 }]}>
                {saving
                    ? <ActivityIndicator color="#FFF" />
                    : <Text style={styles.saveText}>{!type ? 'Pick a document type' : missing ? `Enter ${missing.label}` : 'Save'}</Text>}
            </TouchableOpacity>
        </Sheet>
    );
}

function FieldInput({ field, values, set, colors }: {
    field: DocField; values: Values; set: (key: string, value: string) => void; colors: typeof Colors.light;
}) {
    const value = values[field.key] || '';
    const input = [styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }];
    const title = (
        <Text style={[styles.label, { color: colors.textSecondary }]}>
            {field.label}{field.required ? ' *' : ''}
        </Text>
    );

    if (field.type === 'customer' || field.type === 'supplier') {
        return (
            <View style={styles.field}>
                {title}
                <PartyPicker kind={field.type} value={value} colors={colors} input={input}
                    onPick={(name, id) => { set(field.key, name); set(`${field.key}_id`, id); }} />
            </View>
        );
    }
    if (field.type === 'date') {
        return (
            <View style={styles.field}>
                {title}
                <DateInput value={value} onChange={v => set(field.key, v)} colors={colors} input={input} />
            </View>
        );
    }
    return (
        <View style={styles.field}>
            {title}
            <View style={styles.row}>
                {field.type === 'amount' && <Text style={[styles.rupee, { color: colors.textSecondary }]}>₹</Text>}
                <TextInput
                    style={[...input, { flex: 1 }, field.type === 'longtext' && styles.long]}
                    value={value}
                    onChangeText={v => set(field.key, v)}
                    placeholder={field.type === 'amount' ? '0.00' : field.label}
                    placeholderTextColor={colors.placeholder}
                    keyboardType={field.type === 'amount' ? 'decimal-pad' : 'default'}
                    multiline={field.type === 'longtext'}
                    textAlignVertical={field.type === 'longtext' ? 'top' : 'center'}
                />
            </View>
        </View>
    );
}

/** Pick the customer / supplier from ERPNext. A party ERPNext does not have yet (a new
 * customer's first PO) can still be used as typed. */
function PartyPicker({ kind, value, onPick, colors, input }: {
    kind: 'customer' | 'supplier'; value: string; onPick: (name: string, id: string) => void;
    colors: typeof Colors.light; input: any[];
}) {
    const [query, setQuery] = useState('');
    const [found, setFound] = useState<Match[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        const q = query.trim();
        if (value || q.length < 2) return;
        const h = setTimeout(async () => {
            setSearching(true);
            const r = kind === 'customer' ? await searchCustomers(q) : await searchSuppliers(q);
            setSearching(false);
            if (!r.ok) { setFound([]); return; }
            setFound(kind === 'customer'
                ? (r.data as any[]).slice(0, 8).map(c => ({ id: c.name, name: c.customer_name || c.name }))
                : (r.data as any[]).slice(0, 8).map(s => ({ id: s.name, name: s.supplier_name || s.name })));
        }, 300);
        return () => clearTimeout(h);
    }, [query, kind, value]);

    if (value) {
        return (
            <TouchableOpacity onPress={() => { onPick('', ''); setQuery(''); setFound([]); }}
                style={[styles.picked, { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
                <Text style={[styles.pickedText, { color: colors.primary }]} numberOfLines={1}>{value}</Text>
                <Ionicons name="close-circle" size={18} color={colors.primary} />
            </TouchableOpacity>
        );
    }
    const typed = query.trim();
    return (
        <View>
            <View style={styles.row}>
                <TextInput style={[...input, { flex: 1 }]} value={query} onChangeText={setQuery}
                    placeholder={`Search ${kind} in ERPNext`} placeholderTextColor={colors.placeholder} />
                {searching && <ActivityIndicator color={colors.primary} style={{ marginLeft: 8 }} />}
            </View>
            {typed.length >= 2 && found.map(m => (
                <TouchableOpacity key={m.id} onPress={() => onPick(m.name, m.id)}
                    style={[styles.result, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.resultText, { color: colors.text }]}>{m.name}</Text>
                    {m.id !== m.name && <Text style={[styles.hint, { color: colors.textSecondary }]}>{m.id}</Text>}
                </TouchableOpacity>
            ))}
            {typed.length >= 2 && !searching && (
                <TouchableOpacity onPress={() => onPick(typed, '')} style={styles.result}>
                    <Text style={[styles.hint, { color: colors.primary }]}>
                        Use “{typed}”{found.length ? '' : ' — not found in ERPNext'}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

function DateInput({ value, onChange, colors, input }: {
    value: string; onChange: (iso: string) => void; colors: typeof Colors.light; input: any[];
}) {
    const [open, setOpen] = useState(false);
    if (Platform.OS === 'web') {
        return <TextInput style={input} value={value} onChangeText={onChange} placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.placeholder} />;
    }
    return (
        <View style={styles.row}>
            <Pressable onPress={() => setOpen(true)} style={[...input, styles.dateBox]}>
                <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                <Text style={{ color: value ? colors.text : colors.placeholder, fontSize: 15 }}>
                    {value ? dmy(value) : 'Pick a date'}
                </Text>
            </Pressable>
            {!!value && (
                <TouchableOpacity onPress={() => onChange('')} hitSlop={8} style={{ marginLeft: 8 }}>
                    <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
            )}
            {open && (
                <DateTimePicker
                    value={value ? new Date(`${value}T00:00:00`) : new Date()}
                    mode="date"
                    display="default"
                    onChange={(_e, picked) => { setOpen(false); if (picked) onChange(isoOf(picked)); }}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    label: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
    types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    type: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
    typeText: { fontSize: 13, fontWeight: '700' },
    field: { gap: 0 },
    row: { flexDirection: 'row', alignItems: 'center' },
    input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
    long: { minHeight: 90 },
    rupee: { fontSize: 16, fontWeight: '800', marginRight: 8 },
    dateBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    picked: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10 },
    pickedText: { flex: 1, fontSize: 15, fontWeight: '700' },
    result: { paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
    resultText: { fontSize: 14, fontWeight: '600' },
    hint: { fontSize: 12, fontWeight: '600' },
    save: { borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
    saveText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});
