import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Glass } from '../ui/Glass';
import { PressableScale } from '../ui/PressableScale';
import { getCurrency } from '../core/currencies';
import { color, font, motion, radius, space, type } from '../theme';

type Side = { code: string; amount: string; label: string };
type Props = {
  from: Side;
  to: Side;
  dim: boolean;
  rateLine: string;
  extra?: string;
  onFrom: () => void;
  onTo: () => void;
};

function Amount({ text, dim, tint }: { text: string; dim: boolean; tint: string }) {
  const reduce = useReducedMotion();
  const v = useSharedValue(dim ? 0.3 : 1);
  useEffect(() => {
    if (reduce) {
      v.value = dim ? 0.3 : 1;
      return;
    }
    v.value = 0.3;
    v.value = withTiming(dim ? 0.3 : 1, { duration: motion.swap, easing: motion.easeOut });
  }, [text, dim, reduce, v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * 4 }] }));
  const size = text.length > 11 ? 20 : text.length > 8 ? 24 : 30;
  return (
    <Animated.Text style={[styles.amount, { color: tint, fontSize: size, lineHeight: 36 }, style]} numberOfLines={1}>
      {text}
    </Animated.Text>
  );
}

function SideButton({ side, accent, dim, onPress, hint }: { side: Side; accent: boolean; dim: boolean; onPress: () => void; hint: string }) {
  const c = getCurrency(side.code);
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${side.label}: ${side.amount} ${c?.name ?? side.code}`}
      accessibilityHint={hint}
      style={[styles.side, accent ? styles.sideAccent : styles.sidePlain]}
    >
      <Text style={styles.sideLabel}>{side.label}</Text>
      <View style={[styles.chip, accent && styles.chipAccent]}>
        <Text style={styles.flag}>{c?.flag}</Text>
        <Text style={styles.code}>{side.code}</Text>
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color.white} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M6 9l6 6 6-6" />
        </Svg>
      </View>
      <Amount text={side.amount} dim={dim} tint={accent ? color.green : color.white} />
    </PressableScale>
  );
}

/** The glass readout at the bottom of the camera. Both sides open the full currency list. */
export function ConversionBar({ from, to, dim, rateLine, extra, onFrom, onTo }: Props) {
  return (
    <Glass style={styles.bar}>
      <View style={styles.row}>
        <SideButton side={from} accent={false} dim={dim} onPress={onFrom} hint="Choose the currency on the tag" />
        <View style={styles.arrow} accessible={false}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color.white} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M5 12h14M13 6l6 6-6 6" />
          </Svg>
        </View>
        <SideButton side={to} accent dim={dim} onPress={onTo} hint="Choose the currency to show prices in" />
      </View>
      <View style={styles.meta}>
        <Text style={styles.rate} numberOfLines={1}>{rateLine}</Text>
        {extra ? <Text style={styles.extra} numberOfLines={1}>{extra}</Text> : null}
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  bar: { borderRadius: radius.sheet, padding: space.md, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  side: { flex: 1, minWidth: 0, padding: 14, borderRadius: radius.card, gap: space.sm, borderWidth: 1 },
  sidePlain: { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.12)' },
  sideAccent: { backgroundColor: color.greenTint, borderColor: color.greenBorder },
  sideLabel: { ...type.label, color: color.onGlassMuted },
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingVertical: 5, paddingLeft: 8, paddingRight: 8, borderRadius: radius.chip, backgroundColor: color.glassChip },
  chipAccent: { backgroundColor: 'rgba(0,214,50,0.22)' },
  flag: { fontSize: 15 },
  code: { color: color.white, fontSize: 14, fontWeight: '600' },
  amount: { fontWeight: '600', letterSpacing: -0.8, ...font.numbers },
  arrow: {
    width: 28, height: 28, marginHorizontal: -6, zIndex: 1, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(40,42,46,0.92)', borderWidth: 1, borderColor: color.glassBorder,
  },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, paddingHorizontal: 6 },
  rate: { flex: 1, fontSize: 12, color: color.onGlassMuted, ...font.numbers },
  extra: { fontSize: 12, fontWeight: '500', color: color.white, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.chip, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', ...font.numbers },
});
