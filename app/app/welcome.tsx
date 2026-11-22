import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';
import { Screen } from '../src/ui/Screen';
import { Button } from '../src/ui/Button';
import { PressableScale } from '../src/ui/PressableScale';
import { useSettings } from '../src/state/settings';
import { useAccess } from '../src/state/access';
import { getCurrency } from '../src/core/currencies';
import { color, radius, space, type } from '../src/theme';

function Logo() {
  return (
    <View style={styles.logo} accessibilityRole="image" accessibilityLabel="Tagio">
      <Svg width={30} height={30} viewBox="0 0 24 24">
        <Path d="M2.5 12.2V3.6c0-.6.5-1.1 1.1-1.1h8.6l9.3 9.3-9.7 9.7z" fill={color.black} />
        <Circle cx={7.6} cy={7.6} r={1.8} fill={color.green} />
      </Svg>
      <Text style={styles.wordmark}>tagio</Text>
    </View>
  );
}

export default function Welcome() {
  const { to } = useSettings();
  const { hasAccess } = useAccess();
  const c = getCurrency(to);
  return (
    <Screen
      scroll={false}
      footer={
        <>
          <Button title="Continue" onPress={() => router.push(hasAccess ? '/scan' : '/plans')} />
          <Text style={styles.small}>No account needed. We never store what you scan.</Text>
        </>
      }
    >
      <View style={{ paddingTop: space.xxl, gap: space.xxl }}>
        <Logo />
        <Text accessibilityRole="header" style={styles.hero}>Point at a price tag. See it in your money.</Text>
        <View style={styles.demo} accessible accessibilityLabel="Example: a tag reading 450 Kenyan shillings shows as 3 dollars 46">
          <View style={styles.tag}>
            <Text style={styles.tagLabel}>UNGA 2KG</Text>
            <Text style={styles.tagPrice}>KSh 450</Text>
          </View>
          <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={color.black} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M5 12h14M13 6l6 6-6 6" />
          </Svg>
          <View style={styles.yours}>
            <Text style={[styles.tagLabel, { color: color.black }]}>YOUR PRICE</Text>
            <Text style={styles.tagPrice}>$3.46</Text>
          </View>
        </View>
        <View style={{ gap: space.sm }}>
          <Text style={styles.fieldLabel}>Show prices in</Text>
          <PressableScale onPress={() => router.push({ pathname: '/currency', params: { side: 'to' } })} accessibilityLabel={`Show prices in ${c?.name}. Change`} style={styles.picker}>
            <View style={styles.pickerLeft}>
              <Text style={styles.flag}>{c?.flag}</Text>
              <Text style={styles.code}>{to}</Text>
              <Text style={styles.name} numberOfLines={1}>{c?.name}</Text>
            </View>
            <Text style={styles.change}>Change</Text>
          </PressableScale>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmark: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5, color: color.black },
  hero: { fontSize: 40, lineHeight: 42, fontWeight: '600', letterSpacing: -1.2, color: color.black },
  demo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.lg, paddingVertical: 28, backgroundColor: color.surface, borderRadius: radius.card, borderWidth: 1, borderColor: color.line },
  tag: { paddingVertical: 14, paddingHorizontal: 18, borderWidth: 1.5, borderColor: color.black, borderTopLeftRadius: radius.chip, borderBottomLeftRadius: radius.chip, borderTopRightRadius: radius.control, borderBottomRightRadius: radius.control, gap: 4 },
  yours: { paddingVertical: 14, paddingHorizontal: 18, backgroundColor: color.green, borderRadius: radius.control, gap: 4 },
  tagLabel: { ...type.label, color: color.muted },
  tagPrice: { fontSize: 26, fontWeight: '700', color: color.black, fontVariant: ['tabular-nums'] },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: color.muted },
  picker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 60, paddingHorizontal: 18, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.control },
  pickerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  flag: { fontSize: 22 },
  code: { fontSize: 16, fontWeight: '600', color: color.black },
  name: { fontSize: 16, color: color.muted, flexShrink: 1 },
  change: { fontSize: 14, fontWeight: '600', color: color.muted },
  small: { ...type.caption, color: color.muted, textAlign: 'center' },
});
