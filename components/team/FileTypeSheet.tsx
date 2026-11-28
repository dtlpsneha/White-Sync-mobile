/**
 * The attach sheet of Team Chat. Top: pick the document type, then fill the few fields that
 * type asks for (customer, number, date, amount...). Below: add the file itself -- Camera,
 * Gallery or PDF / file. The types and their fields come from SmartOps, so this draws
 * whatever it is given.
 *
 * With `withFile` it is the attach sheet (the file is chosen here); without, it files a file
 * already in the chat (the Documents list).
 *
 * Mount it only while it is open (`{open && <FileTypeSheet ... />}`): it starts from
 * `initial` each time, with nothing left over from the last file.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SalesInvoiceHit, searchCustomers, searchSalesInvoices, searchSuppliers } from '@/services/frappeSearch';
import { DocField, DocType, Filing, PickedFile } from '@/services/teamApi';
import { choosePhoto, chooseFile, takePhoto } from './Attach';
import { isImageAttachment } from './chatUi';
import { Sheet } from './Sheet';

type Values = Record<string, string>;
type Match = { id: string; name: string };

const isoOf = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('-') : iso);

export function FileTypeSheet({ types, initial, fileName, saving, onSave, onClose, withFile, file, onFile, preview }: {
    types: DocType[];
    initial?: Filing | null;
    fileName?: string | null;
    saving?: boolean;
    onSave: (filing: Filing) => void;
    onClose: () => void;
    /** Ask for the file here too (the attach sheet). */
    withFile?: boolean;
    file?: PickedFile | null;
    onFile?: (f: PickedFile | null) => void;
    /** SmartOps is too old to keep these details: say so, so nobody fills them in for nothing. */
    preview?: boolean;
}) {
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];
    const [typeKey, setTypeKey] = useState<string | null>(initial?.doc_type ?? null);
    const [values, setValues] = useState<Values>(initial?.details ?? {});
    const type = types.find(t => t.key === typeKey) ?? null;

    const set = (key: string, value: string) => setValues(v => ({ ...v, [key]: value }));

    const save = () => {
        if (!type) return;
        if (missing || (withFile && !file)) return; // the button says what is missing
        const details: Values = {};
        for (const f of type.fields) {
            const v = (values[f.key] || '').trim();
            if (v) details[f.key] = v;
            if (v && values[`${f.key}_id`]) details[`${f.key}_id`] = values[`${f.key}_id`];
        }
        onSave({ doc_type: type.key, details });
    };

    const missing = type?.fields.find(f => f.required && !(values[f.key] || '').trim());

    const pick = (fn: () => Promise<PickedFile | null>) => async () => {
        try {
            const f = await fn();
            if (f) onFile?.(f);
        } catch (e: any) {
            Alert.alert('Attach', `Could not attach: ${e?.message || e}`);
        }
    };

    return (
        <Sheet visible title={withFile ? 'Attach a document' : 'What is this file?'}
            subtitle={withFile ? 'Say what it is, then add the file' : fileName || undefined} onClose={onClose}>
            {preview && (
                <View style={[styles.note, { borderColor: colors.warning, backgroundColor: `${colors.warning}14` }]}>
                    <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
                    <Text style={[styles.noteText, { color: colors.text }]}>
                        Preview: SmartOps has not been updated to keep these details yet, so the file is posted without them.
                    </Text>
                </View>
            )}
            <Text style={[styles.label, { color: colors.textSecondary }]}>Document type</Text>
            <View style={styles.types}>
                {types.map(t => {
                    const on = t.key === typeKey;
                    return (
                        <TouchableOpacity key={t.key} onPress={() => setTypeKey(t.key)} activeOpacity={0.8}
                            style={[styles.type, {
                                borderColor: on ? colors.primary : colors.border,
                                backgroundColor: on ? colors.primary : colors.surface,
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

            {withFile && (
                <View style={styles.field}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>File *</Text>
                    {file ? (
                        <View style={[styles.fileRow, { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
                            {isImageAttachment(file.mimeType, file.name)
                                ? <Image source={{ uri: file.uri }} style={styles.thumb} />
                                : <View style={[styles.thumb, styles.pdf]}><Ionicons name="document-text" size={22} color="#FFF" /></View>}
                            <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{file.name || 'Photo'}</Text>
                            <TouchableOpacity onPress={() => onFile?.(null)} hitSlop={10}>
                                <Ionicons name="close-circle" size={22} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.sources}>
                            {([['camera', 'Camera', takePhoto], ['image', 'Gallery', choosePhoto], ['document-text', 'PDF / file', chooseFile]] as const).map(([icon, text, fn]) => (
                                <TouchableOpacity key={text} onPress={pick(fn)} activeOpacity={0.8}
                                    style={[styles.source, { borderColor: colors.primary }]}>
                                    <Ionicons name={icon as any} size={22} color={colors.primary} />
                                    <Text style={[styles.sourceText, { color: colors.primaryVariant }]}>{text}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>
            )}

            <TouchableOpacity disabled={!type || !!missing || (!!withFile && !file) || saving} onPress={save}
                style={[styles.save, { backgroundColor: !type || missing || (withFile && !file) ? colors.surfaceVariant : colors.primary }]}>
                {saving
                    ? <ActivityIndicator color="#FFF" />
                    : <Text style={[styles.saveText, (!type || missing || (withFile && !file)) && { color: colors.textSecondary }]}>
                        {!type ? 'Pick a document type'
                            : missing ? `Enter ${missing.label}`
                            : withFile && !file ? 'Add the file (camera, gallery or PDF)'
                            : withFile ? 'Attach' : 'Save'}
                    </Text>}
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
    if (field.type === 'invoices') {
        return (
            <View style={styles.field}>
                {title}
                <InvoicePicker value={value} labels={values.invoice_numbers} onChange={v => set(field.key, v)}
                    colors={colors} input={input} />
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
                <Text style={[styles.pickedText, { color: colors.primaryVariant }]} numberOfLines={1}>{value}</Text>
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

/** Tally's invoices an LR carried goods for: several can be picked, from ERPNext. Kept as
 * ERPNext names "a1b2c3, d4e5f6" -- SmartOps checks each and takes the customer from them.
 * `labels`: Tally's numbers for invoices that came already picked (My Orders' "Add LR"). */
function InvoicePicker({ value, labels, onChange, colors, input }: {
    value: string; labels?: string; onChange: (v: string) => void; colors: typeof Colors.light; input: any[];
}) {
    const picked = value.split(',').map(s => s.trim()).filter(Boolean);
    const [query, setQuery] = useState('');
    const [found, setFound] = useState<SalesInvoiceHit[]>([]);
    const [shown, setShown] = useState<Record<string, SalesInvoiceHit>>(() => {
        const numbers = (labels || '').split(',').map(s => s.trim());
        return Object.fromEntries(picked.map((name, i) => [name, { name, voucher_number: numbers[i] || '', customer: '' }]));
    });
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) return;
        const h = setTimeout(async () => {
            setSearching(true);
            const r = await searchSalesInvoices(q);
            setSearching(false);
            setFound(r.ok ? r.data : []);
        }, 300);
        return () => clearTimeout(h);
    }, [query]);

    const add = (hit: SalesInvoiceHit) => {
        if (!picked.includes(hit.name)) onChange([...picked, hit.name].join(', '));
        setShown(s => ({ ...s, [hit.name]: hit }));
        setQuery('');
        setFound([]);
    };
    const remove = (name: string) => onChange(picked.filter(p => p !== name).join(', '));

    return (
        <View style={{ gap: 8 }}>
            {picked.map(name => {
                const hit = shown[name];
                return (
                    <View key={name} style={[styles.picked, { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.pickedText, { color: colors.primaryVariant }]} numberOfLines={1}>
                                {hit?.voucher_number || name}
                            </Text>
                            {!!hit?.customer && <Text style={[styles.hint, { color: colors.textSecondary }]} numberOfLines={1}>{hit.customer}</Text>}
                        </View>
                        <TouchableOpacity onPress={() => remove(name)} hitSlop={8}>
                            <Ionicons name="close-circle" size={18} color={colors.primary} />
                        </TouchableOpacity>
                    </View>
                );
            })}
            <View style={styles.row}>
                <TextInput style={[...input, { flex: 1 }]} value={query} onChangeText={setQuery}
                    placeholder={picked.length ? 'Add another invoice' : 'Tally invoice no. or customer'}
                    placeholderTextColor={colors.placeholder} autoCapitalize="characters" />
                {searching && <ActivityIndicator color={colors.primary} style={{ marginLeft: 8 }} />}
            </View>
            {query.trim().length >= 2 && found.filter(f => !picked.includes(f.name)).map(f => (
                <TouchableOpacity key={f.name} onPress={() => add(f)} style={[styles.result, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.resultText, { color: colors.text }]}>{f.voucher_number || f.name}</Text>
                    <Text style={[styles.hint, { color: colors.textSecondary }]} numberOfLines={1}>
                        {[f.customer, f.date ? f.date.split('-').reverse().join('-') : '', f.sales_invoice ? '' : 'no Sales Invoice yet'].filter(Boolean).join(' · ')}
                    </Text>
                </TouchableOpacity>
            ))}
            {query.trim().length >= 2 && !searching && found.length === 0 && (
                <Text style={[styles.hint, { color: colors.textSecondary }]}>No invoice from Tally matches “{query.trim()}”.</Text>
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
    label: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.66, marginBottom: 6 },
    types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    type: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
    typeText: { fontSize: 12.5, fontWeight: '700' },
    field: { gap: 0 },
    row: { flexDirection: 'row', alignItems: 'center' },
    input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, minHeight: 46 },
    long: { minHeight: 90 },
    rupee: { fontSize: 16, fontWeight: '800', marginRight: 8 },
    dateBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    picked: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderWidth: 1.5, borderRadius: Radius.md, paddingHorizontal: 14, minHeight: 46, paddingVertical: 10 },
    pickedText: { flex: 1, fontSize: 14, fontWeight: '800' },
    result: { paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },
    resultText: { fontSize: 14, fontWeight: '600' },
    hint: { fontSize: 12, fontWeight: '600' },
    note: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.md, padding: 10 },
    noteText: { flex: 1, fontSize: 12.5, fontWeight: '600' },
    sources: { flexDirection: 'row', gap: 10 },
    source: { flex: 1, height: 72, alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 16 },
    sourceText: { fontSize: 12, fontWeight: '800' },
    fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: Radius.md, padding: 8 },
    thumb: { width: 40, height: 40, borderRadius: 8 },
    pdf: { backgroundColor: '#E4572E', justifyContent: 'center', alignItems: 'center' },
    fileName: { flex: 1, fontSize: 14, fontWeight: '700' },
    save: { borderRadius: 16, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
    saveText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});
