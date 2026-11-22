import { ActivityIndicator, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { PressableScale } from './PressableScale';
import { color, radius, type } from '../theme';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'text' | 'onDark';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled, style, accessibilityHint }: Props) {
  const off = disabled || loading;
  const s = styles[variant];
  return (
    <PressableScale
      onPress={onPress}
      disabled={off}
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      style={[styles.base, s.box, off && variant === 'primary' && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? color.black : color.text} />
      ) : (
        <Text style={[styles.label, s.label, off && variant === 'primary' && styles.disabledLabel]}>{title}</Text>
      )}
    </PressableScale>
  );
}

const styles = {
  base: { minHeight: 56, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 } as ViewStyle,
  label: { ...type.headline },
  disabled: { backgroundColor: color.disabled },
  disabledLabel: { color: color.muted },
  primary: StyleSheet.create({ box: { backgroundColor: color.green }, label: { color: color.black } }),
  secondary: StyleSheet.create({ box: { backgroundColor: color.surface, borderWidth: 1.5, borderColor: color.black }, label: { color: color.black } }),
  text: StyleSheet.create({ box: { minHeight: 44, backgroundColor: 'transparent' }, label: { color: color.text, fontWeight: '600', fontSize: 15 } }),
  onDark: StyleSheet.create({ box: { minHeight: 44, backgroundColor: 'transparent' }, label: { color: color.white, fontWeight: '600', fontSize: 15 } }),
};
