import React, { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Screen } from '../src/ui/Screen';
import { PressableScale } from '../src/ui/PressableScale';
import { shareKey } from '../src/ui/KeyCard';
import { useSettings } from '../src/state/settings';
import { useAccess } from '../src/state/access';
import { useRates, ratesAge } from '../src/lib/rates';
import { getCurrency } from '../src/core/currencies';
import { config } from '../src/config';
import { color, radius, space, type } from '../src/theme';

const fmtDate = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '';

function Chevron() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color.muted} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

function Row({ label, value, sub, onPress, right, last }: { label: string; value?: string; sub?: string; onPress?: () => void; right?: React.ReactNode; last?: boolean }) {
  const inner = (
    <>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {right}
      {onPress && !right ? <Chevron /> : null}
    </>
  );
  const style = [styles.row, !last && styles.rowLine];
  return onPress ? (
    <PressableScale onPress={onPress} accessibilityLabel={`${label}${value ? `, ${value}` : ''}`} style={style}>{inner}</PressableScale>
  ) : (
    <View style={style}>{inner}</View>
  );
}

function SmallButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityLabel={title} style={styles.small}>
      <Text style={styles.smallText}>{title}</Text>
    </PressableScale>
  );
}

export default function Settings() {
  const s = useSettings();
  const { access, owner, refreshOwner, replaceSlot, manageSubscription } = useAccess();
  const rates = useRates();
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const to = getCurrency(s.to);

  useEffect(() => {
    if (access.kind === 'owner') refreshOwner();
  }, [access.kind, refreshOwner]);

  const confirmReplace = (slotNo: number) =>
    Alert.alert(`Replace friend key ${slotNo}?`, 'The current key stops working straight away. We’ll email you the new one.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Replace',
        style: 'destructive',
        onPress: async () => {
          setBusySlot(slotNo);
          try {
            await replaceSlot(slotNo);
          } catch {
            Alert.alert('Couldn’t replace the key', 'Check your connection and try again.');
          } finally {
            setBusySlot(null);
          }
        },
      },
    ]);

  return (
    <Screen back title="Settings">
      <Text style={styles.section}>PRICES</Text>
      <View style={styles.card}>
        <Row label="Show prices in" value={`${to?.flag ?? ''} ${s.to}`} onPress={() => router.push({ pathname: '/currency', params: { side: 'to' } })} />
        <Row
          label="Tag currency"
          value={s.from === 'auto' ? `Auto${s.lastConfirmed ? ` · ${s.lastConfirmed} now` : ''}` : s.from}
          onPress={() => router.push({ pathname: '/currency', params: { side: 'from' } })}
        />
        <Row
          label="Rounding"
          last
          right={
            <View style={styles.segment} accessibilityRole="radiogroup">
              {(['exact', 'whole'] as const).map((r) => (
                <PressableScale
                  key={r}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: s.rounding === r }}
                  accessibilityLabel={r === 'exact' ? 'Exact amounts' : 'Whole numbers'}
                  onPress={() => s.update({ rounding: r })}
                  style={[styles.segItem, s.rounding === r && styles.segOn]}
                >
                  <Text style={styles.segText}>{r === 'exact' ? '3.46' : '3'}</Text>
                </PressableScale>
              ))}
            </View>
          }
        />
      </View>

      <Text style={styles.section}>ACCESS</Text>
      <View style={styles.card}>
        {access.kind === 'owner' && (
          <>
            <Row
              label={access.plan === 'share' ? 'Tagio Share' : 'Tagio Solo'}
              sub={access.expiresAt ? `${access.willRenew ? 'Renews' : 'Ends'} ${fmtDate(access.expiresAt)}` : undefined}
              right={<Text style={styles.badge}>Active</Text>}
            />
            {access.plan === 'share' && owner?.slots.length
              ? owner.slots.map((slot) => (
                  <Row
                    key={slot.slotNo}
                    label={`Friend key ${slot.slotNo}`}
                    sub={slot.inUse ? `In use on 1 phone${slot.activatedAt ? ` · since ${fmtDate(slot.activatedAt)}` : ''}` : `${slot.key} · not used yet`}
                    right={
                      busySlot === slot.slotNo ? <Text style={styles.rowSub}>Replacing…</Text> : slot.inUse
                        ? <SmallButton title="Replace" onPress={() => confirmReplace(slot.slotNo)} />
                        : <SmallButton title="Share" onPress={() => shareKey(slot.key)} />
                    }
                  />
                ))
              : access.plan === 'share' && <Row label="Get your 2 friend keys" sub="Add an email and we'll send them" onPress={() => router.push('/email')} />}
            <Row label="Manage subscription" onPress={() => manageSubscription().catch(() => {})} last />
          </>
        )}
        {access.kind === 'friend' && (
          <Row label="Using a friend key" sub={`Works until ${fmtDate(access.expiresAt)}, renewed automatically while their plan is active`} last />
        )}
        {access.kind === 'none' && <Row label="No active plan" sub="Choose a plan or enter a friend key" onPress={() => router.push('/plans')} last />}
      </View>

      {access.kind === 'owner' && (
        <View style={styles.card}>
          <Row
            label="Email"
            sub={owner?.email ?? 'Not added. For receipts, reminders and friend keys.'}
            right={<SmallButton title={owner?.email ? 'Change' : 'Add'} onPress={() => router.push('/email')} />}
            last
          />
        </View>
      )}

      <View style={styles.foot}>
        <Text style={styles.footText}>We never store what you scan.</Text>
        <Text style={styles.footText}>Rates updated {ratesAge(rates.updatedAt)} · Rates by Exchange Rate API</Text>
        <PressableScale accessibilityRole="link" onPress={() => Linking.openURL(config.privacyUrl)} accessibilityLabel="Privacy policy">
          <Text style={[styles.footText, styles.link]}>Privacy policy</Text>
        </PressableScale>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { ...type.label, color: color.muted, marginBottom: -space.md, paddingHorizontal: space.sm },
  card: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 56, paddingHorizontal: space.lg, paddingVertical: space.sm },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  rowLabel: { fontSize: 15, fontWeight: '500', color: color.text },
  rowSub: { fontSize: 13, color: color.muted },
  rowValue: { fontSize: 15, fontWeight: '600', color: color.text },
  badge: { ...type.label, backgroundColor: color.green, color: color.black, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.chip, overflow: 'hidden' },
  segment: { flexDirection: 'row', padding: 3, backgroundColor: color.lineSoft, borderRadius: radius.control },
  segItem: { minWidth: 56, minHeight: 34, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  segOn: { backgroundColor: color.surface, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontSize: 14, fontWeight: '600', color: color.text, fontVariant: ['tabular-nums'] },
  small: { minHeight: 40, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1.5, borderColor: color.black, borderRadius: radius.chip },
  smallText: { fontSize: 14, fontWeight: '600', color: color.black },
  foot: { alignItems: 'center', gap: 6, paddingTop: space.sm },
  footText: { ...type.caption, color: color.muted, textAlign: 'center' },
  link: { textDecorationLine: 'underline', paddingVertical: 8 },
});
