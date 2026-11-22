import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { scheduleOnRN } from 'react-native-worklets';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass } from './Glass';
import { CurrencyList, type Suggestion } from './CurrencyList';
import { PressableScale } from './PressableScale';
import { color, motion, radius, space, type } from '../theme';

type Props = {
  open: boolean;
  title: string;
  selected: string | 'auto';
  suggestions: Suggestion[];
  autoNote?: string;
  onPick: (code: string | 'auto') => void;
  onClose: () => void;
};

/** Glass sheet over the camera. Slides up on a drawer curve and back down when closed. */
export function CurrencySheet({ open, title, selected, suggestions, autoNote, onPick, onClose }: Props) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const y = useSharedValue(height);
  const scrim = useSharedValue(0);

  useEffect(() => {
    const d = reduce ? 0 : motion.sheet;
    if (open) {
      setMounted(true);
      y.value = withTiming(0, { duration: d, easing: motion.drawer });
      scrim.value = withTiming(1, { duration: reduce ? 0 : 300 });
    } else {
      scrim.value = withTiming(0, { duration: reduce ? 0 : 300 });
      y.value = withTiming(height, { duration: d, easing: motion.drawer }, (done) => {
        if (done) scheduleOnRN(setMounted, false);
      });
    }
  }, [open, height, reduce, y, scrim]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));

  if (!mounted) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close currency list" />
      </Animated.View>
      <Animated.View style={[styles.sheetWrap, { top: insets.top + 44 }, sheetStyle]} accessibilityViewIsModal>
        <Glass intensity={60} style={[styles.sheet, { paddingBottom: insets.bottom }]}>
          <View style={styles.grabber} />
          <View style={styles.head}>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <PressableScale onPress={onClose} hitSlop={8} accessibilityLabel="Done">
              <Text style={styles.done}>Done</Text>
            </PressableScale>
          </View>
          <CurrencyList tone="dark" selected={selected} suggestions={suggestions} autoNote={autoNote} onPick={onPick} />
        </Glass>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.38)' },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: { flex: 1, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderBottomWidth: 0, paddingHorizontal: space.lg, paddingTop: 10 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  title: { ...type.title, fontSize: 20, color: color.white },
  done: { fontSize: 15, fontWeight: '600', color: color.green, padding: 4 },
});
