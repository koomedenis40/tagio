import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CurrencyList } from '../src/ui/CurrencyList';
import { Button } from '../src/ui/Button';
import { useSettings } from '../src/state/settings';
import { localCurrencyFor } from '../src/core/currencies';
import { color, space, type } from '../src/theme';

/** Full-screen picker used outside the camera (Welcome and Settings). */
export default function CurrencyPicker() {
  const { side = 'to' } = useLocalSearchParams<{ side?: 'to' | 'from' }>();
  const settings = useSettings();
  const local = localCurrencyFor(settings.region);

  const suggestions = useMemo(() => {
    const list: { code: string; note: string }[] = [];
    const add = (code: string | undefined | null, note: string) => {
      if (code && !list.some((s) => s.code === code)) list.push({ code, note });
    };
    if (side === 'from') {
      add(local, 'Used where you are now');
      add(settings.lastConfirmed, 'Last read on a tag');
    } else {
      add(settings.to, 'Your currency');
      add(local, 'Used where you are now');
      add('USD', 'Popular');
      add('EUR', 'Popular');
    }
    return side === 'from' ? [{ code: 'auto' as const, note: 'Reads the currency on each tag' }, ...list] : list;
  }, [side, local, settings.to, settings.lastConfirmed]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={styles.title}>{side === 'from' ? 'Tag currency' : 'Show prices in'}</Text>
        <Button title="Done" variant="text" onPress={() => router.back()} />
      </View>
      <View style={styles.body}>
        <CurrencyList
          tone="light"
          selected={side === 'from' ? settings.from : settings.to}
          suggestions={suggestions}
          onPick={(code) => {
            if (side === 'from') settings.update(code === 'auto' ? { from: 'auto' } : { from: code, lastConfirmed: code });
            else if (code !== 'auto') settings.update({ to: code });
            router.back();
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: space.xl, paddingRight: space.md, minHeight: 56 },
  title: { ...type.title, color: color.text },
  body: { flex: 1, paddingHorizontal: space.lg },
});
