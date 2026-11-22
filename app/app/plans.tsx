import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Screen } from '../src/ui/Screen';
import { Button } from '../src/ui/Button';
import { PressableScale } from '../src/ui/PressableScale';
import { useAccess, type Plan } from '../src/state/access';
import { color, radius, space, type } from '../src/theme';

const PERKS = ['Live conversion, no tapping', 'Detects the currency on the tag', 'Works offline with saved rates'];

export default function Plans() {
  const { offers, purchase, restore } = useAccess();
  const [plan, setPlan] = useState<Plan>('share');
  const [busy, setBusy] = useState<null | 'buy' | 'restore'>(null);

  const buy = async () => {
    setBusy('buy');
    try {
      const result = await purchase(plan);
      if (result === 'done') router.replace(plan === 'share' ? '/email' : '/scan');
    } catch (e) {
      Alert.alert('Purchase not completed', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doRestore = async () => {
    setBusy('restore');
    try {
      const ok = await restore();
      if (ok) router.replace('/scan');
      else Alert.alert('Nothing to restore', 'We couldn’t find a Tagio plan on this store account.');
    } catch {
      Alert.alert('Couldn’t restore', 'Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const card = (id: Plan, title: string, sub: string, badge?: string) => {
    const on = plan === id;
    return (
      <PressableScale onPress={() => setPlan(id)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${title}. ${sub}. ${offers[id].price ?? ''} per month`} style={[styles.card, on && styles.cardOn]}>
        <View style={{ gap: 4, flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle}>{title}</Text>
            {badge ? <Text style={styles.badge}>{badge}</Text> : null}
          </View>
          <Text style={styles.cardSub}>{sub}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.price}>{offers[id].price ?? '—'}</Text>
          <Text style={styles.per}>per month</Text>
        </View>
      </PressableScale>
    );
  };

  return (
    <Screen
      back
      title="Choose your plan"
      subtitle="Monthly. Cancel anytime in the App Store or Google Play."
      footer={
        <>
          <Button title={plan === 'share' ? 'Subscribe to Share' : 'Subscribe to Solo'} onPress={buy} loading={busy === 'buy'} disabled={!!busy || !offers[plan].pkg} />
          <View style={styles.links}>
            <Button title="I have a friend key" variant="text" onPress={() => router.push('/redeem')} />
            <Button title="Restore purchases" variant="text" onPress={doRestore} loading={busy === 'restore'} />
          </View>
          <Text style={styles.fine}>Paid through your App Store or Google Play account. Renews monthly until you cancel.</Text>
        </>
      }
    >
      <View style={{ gap: space.md }} accessibilityRole="radiogroup">
        {card('solo', 'Solo', 'Just you, on this phone')}
        {card('share', 'Share', 'You + 2 friend keys by email', '3 PEOPLE')}
      </View>
      <View style={{ gap: space.md }}>
        {PERKS.map((p) => (
          <View key={p} style={styles.perk}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color.black} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M5 12.5l4.5 4.5L19 7.5" />
            </Svg>
            <Text style={styles.perkText}>{p}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: radius.card, borderWidth: 2, borderColor: color.line, backgroundColor: color.surface },
  cardOn: { borderColor: color.black },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 20, fontWeight: '600', color: color.black },
  badge: { ...type.label, backgroundColor: color.green, color: color.black, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.chip, overflow: 'hidden' },
  cardSub: { fontSize: 14, color: color.muted },
  price: { fontSize: 17, fontWeight: '700', color: color.black, fontVariant: ['tabular-nums'] },
  per: { fontSize: 12, color: color.muted },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  perkText: { fontSize: 14, color: color.black },
  links: { flexDirection: 'row', justifyContent: 'space-between' },
  fine: { fontSize: 12, lineHeight: 17, color: color.muted },
});
