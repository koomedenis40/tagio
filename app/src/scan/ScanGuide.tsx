import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { color, font, motion, radius } from '../theme';

type Props = { locked: boolean; label?: string; width: number; height: number };

/**
 * The box you point at a price. While searching the corners breathe and a line sweeps
 * across; on lock the corners snap in and the converted price rises above the box.
 */
export function ScanGuide({ locked, label, width, height }: Props) {
  const reduce = useReducedMotion();
  const breathe = useSharedValue(1);
  const snap = useSharedValue(locked ? 1 : 0);
  const sweep = useSharedValue(0);
  const pill = useSharedValue(0);

  useEffect(() => {
    if (locked) {
      cancelAnimation(breathe);
      cancelAnimation(sweep);
      breathe.value = withTiming(1, { duration: motion.lock, easing: motion.easeOut });
      snap.value = withTiming(1, { duration: reduce ? 0 : motion.lock, easing: motion.easeOut });
      pill.value = withDelay(reduce ? 0 : 60, withTiming(1, { duration: reduce ? 0 : motion.lock, easing: motion.easeOut }));
    } else {
      snap.value = withTiming(0, { duration: reduce ? 0 : 200 });
      pill.value = 0;
      if (!reduce) {
        breathe.value = withRepeat(withSequence(
          withTiming(1.035, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        ), -1);
        sweep.value = 0;
        sweep.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
      }
    }
  }, [locked, reduce, breathe, snap, sweep, pill]);

  // A new number while locked: drop the label and bring it back, so the change reads as one move.
  useEffect(() => {
    if (!locked || reduce) return;
    pill.value = 0;
    pill.value = withTiming(1, { duration: motion.swap, easing: motion.easeOut });
  }, [label, locked, reduce, pill]);

  const frameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathe.value * (1.08 - 0.08 * snap.value) }],
    opacity: 0.75 + 0.25 * snap.value,
  }));
  const sweepStyle = useAnimatedStyle(() => ({
    opacity: 1 - snap.value,
    transform: [{ translateY: sweep.value * (height - 8) }],
  }));
  const pillStyle = useAnimatedStyle(() => ({
    opacity: pill.value,
    transform: [{ translateY: (1 - pill.value) * 6 }, { scale: 0.95 + 0.05 * pill.value }],
  }));

  return (
    <View pointerEvents="none" style={{ width, height }}>
      <Animated.View style={[styles.pillWrap, pillStyle]}>
        {label ? (
          <>
            <View style={styles.pill}>
              <Text style={styles.pillText} numberOfLines={1} adjustsFontSizeToFit accessibilityLiveRegion="polite">{label}</Text>
            </View>
            <View style={styles.pointer} />
          </>
        ) : null}
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, frameStyle]}>
        <View style={[styles.corner, styles.tl]} />
        <View style={[styles.corner, styles.tr]} />
        <View style={[styles.corner, styles.bl]} />
        <View style={[styles.corner, styles.br]} />
        <Animated.View style={[styles.sweep, sweepStyle]} />
      </Animated.View>
    </View>
  );
}

const C = 26;
const B = 3;
const styles = StyleSheet.create({
  corner: { position: 'absolute', width: C, height: C, borderColor: color.green },
  tl: { left: 0, top: 0, borderLeftWidth: B, borderTopWidth: B, borderTopLeftRadius: 10 },
  tr: { right: 0, top: 0, borderRightWidth: B, borderTopWidth: B, borderTopRightRadius: 10 },
  bl: { left: 0, bottom: 0, borderLeftWidth: B, borderBottomWidth: B, borderBottomLeftRadius: 10 },
  br: { right: 0, bottom: 0, borderRightWidth: B, borderBottomWidth: B, borderBottomRightRadius: 10 },
  sweep: {
    position: 'absolute', left: 12, right: 12, top: 4, height: 2, borderRadius: 1, backgroundColor: color.green,
    shadowColor: color.green, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  pillWrap: { position: 'absolute', left: -40, right: -40, bottom: '100%', marginBottom: 10, alignItems: 'center' },
  pill: {
    backgroundColor: color.green, borderRadius: radius.control, paddingHorizontal: 16, paddingVertical: 8, maxWidth: '100%',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  pillText: { color: color.black, fontSize: 28, fontWeight: '700', letterSpacing: -0.5, ...font.numbers },
  pointer: { width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: color.green },
});
