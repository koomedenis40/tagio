import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { PressableScale } from './PressableScale';
import { CURRENCIES, getCurrency, searchCurrencies, type Currency } from '../core/currencies';
import { color, radius, space, type } from '../theme';

export type Suggestion = { code: string | 'auto'; note: string };

type Props = {
  selected: string | 'auto';
  onPick: (code: string | 'auto') => void;
  suggestions: Suggestion[];
  tone: 'light' | 'dark';
  autoNote?: string;
};

type Row =
  | { kind: 'label'; id: string; text: string }
  | { kind: 'suggestion'; id: string; s: Suggestion }
  | { kind: 'currency'; id: string; c: Currency }
  | { kind: 'empty'; id: string };

/** Every currency with its flag, a Suggested group on top, and search by country, name or code. */
export function CurrencyList({ selected, onPick, suggestions, tone, autoNote }: Props) {
  const [query, setQuery] = useState('');
  const t = tone === 'dark' ? dark : light;

  const rows = useMemo<Row[]>(() => {
    const found = searchCurrencies(query);
    const out: Row[] = [];
    if (!query.trim()) {
      out.push({ kind: 'label', id: 'l-s', text: 'SUGGESTED' });
      suggestions.forEach((s, i) => out.push({ kind: 'suggestion', id: `s-${i}-${s.code}`, s }));
      out.push({ kind: 'label', id: 'l-a', text: `ALL CURRENCIES · ${CURRENCIES.length}` });
    } else {
      out.push({ kind: 'label', id: 'l-r', text: `${found.length} RESULT${found.length === 1 ? '' : 'S'}` });
    }
    found.forEach((c) => out.push({ kind: 'currency', id: `c-${c.code}`, c }));
    if (found.length === 0) out.push({ kind: 'empty', id: 'empty' });
    return out;
  }, [query, suggestions]);

  const check = (on: boolean) =>
    on ? (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={t.check} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M5 12.5l4.5 4.5L19 7.5" />
      </Svg>
    ) : null;

  return (
    <View style={styles.flex}>
      <View style={[styles.search, t.search]}>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth={2} strokeLinecap="round">
          <Circle cx={11} cy={11} r={7} />
          <Path d="M20 20l-3.5-3.5" />
        </Svg>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search country, currency or code"
          placeholderTextColor={t.muted}
          style={[styles.input, { color: t.text }]}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          accessibilityLabel="Search currencies"
          returnKeyType="search"
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        initialNumToRender={18}
        contentContainerStyle={styles.listPad}
        renderItem={({ item }) => {
          if (item.kind === 'label') return <Text style={[styles.label, { color: t.muted }]}>{item.text}</Text>;
          if (item.kind === 'empty') return <Text style={[styles.empty, { color: t.muted }]}>No currency matches that search.</Text>;
          if (item.kind === 'suggestion') {
            const { s } = item;
            const c = s.code === 'auto' ? undefined : getCurrency(s.code);
            const title = s.code === 'auto' ? 'Auto-detect' : `${c?.code} · ${c?.name}`;
            return (
              <PressableScale onPress={() => onPick(s.code)} accessibilityLabel={title} accessibilityState={{ selected: selected === s.code }} style={[styles.row, t.row]}>
                {s.code === 'auto' ? (
                  <View style={[styles.flag, styles.autoIcon]}>
                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color.green} strokeWidth={2.2} strokeLinecap="round">
                      <Path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 12h10" />
                    </Svg>
                  </View>
                ) : (
                  <Text style={styles.flagEmoji}>{c?.flag}</Text>
                )}
                <View style={styles.flex}>
                  <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{title}</Text>
                  <Text style={[styles.note, { color: t.muted }]} numberOfLines={1}>{s.code === 'auto' && autoNote ? autoNote : s.note}</Text>
                </View>
                {check(selected === s.code)}
              </PressableScale>
            );
          }
          const { c } = item;
          return (
            <PressableScale onPress={() => onPick(c.code)} accessibilityLabel={`${c.name}, ${c.code}`} accessibilityState={{ selected: selected === c.code }} style={[styles.row, t.row]}>
              <Text style={styles.flagEmoji}>{c.flag}</Text>
              <Text style={[styles.code, { color: t.text }]}>{c.code}</Text>
              <Text style={[styles.name, { color: t.body }]} numberOfLines={1}>{c.name}</Text>
              {check(selected === c.code)}
            </PressableScale>
          );
        }}
      />
    </View>
  );
}

const light = {
  text: color.text, body: color.body, muted: color.muted, check: color.black,
  search: { backgroundColor: color.surface, borderColor: color.line },
  row: { borderBottomColor: color.lineSoft },
};
const dark = {
  text: color.white, body: 'rgba(255,255,255,0.8)', muted: color.onGlassMuted, check: color.green,
  search: { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.12)' },
  row: { borderBottomColor: 'rgba(255,255,255,0.08)' },
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 14, borderRadius: radius.control, borderWidth: 1, marginBottom: space.sm },
  input: { flex: 1, height: 44, fontSize: 16 },
  listPad: { paddingBottom: 40 },
  label: { ...type.label, paddingTop: space.lg, paddingBottom: space.xs, paddingHorizontal: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 54, paddingHorizontal: space.xs, borderBottomWidth: StyleSheet.hairlineWidth },
  flag: { width: 28, height: 21, borderRadius: 3 },
  flagEmoji: { fontSize: 22, width: 28, textAlign: 'center' },
  autoIcon: { backgroundColor: color.greenTint, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '600' },
  note: { fontSize: 12, marginTop: 2 },
  code: { width: 44, fontSize: 15, fontWeight: '600' },
  name: { flex: 1, fontSize: 15 },
  empty: { ...type.body, padding: space.lg },
});
