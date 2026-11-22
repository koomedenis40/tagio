import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { color } from '../theme';

/**
 * Frosted glass over the camera. iOS blurs the live preview; Android can't blur a camera
 * surface, so it gets a deeper translucent tint with the same border and highlight.
 */
export function Glass({ style, children, intensity = 40, ...rest }: ViewProps & { style?: StyleProp<ViewStyle>; intensity?: number }) {
  const flat = StyleSheet.flatten(style) ?? {};
  const r = flat.borderRadius;
  return (
    <View {...rest} style={[styles.frame, style, { overflow: 'hidden' }]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={intensity} tint="systemUltraThinMaterialDark" style={[StyleSheet.absoluteFill, { borderRadius: r }]} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: color.glassFillAndroid, borderRadius: r }]} />
      )}
      <View pointerEvents="none" style={[styles.highlight, { borderTopLeftRadius: r, borderTopRightRadius: r }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: color.glassBorder, backgroundColor: Platform.OS === 'ios' ? color.glassFill : 'transparent' },
  highlight: { position: 'absolute', left: 0, right: 0, top: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.22)' },
});
