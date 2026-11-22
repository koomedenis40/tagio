import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { motion } from '../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Every tappable thing shrinks to 97% while pressed, so taps feel answered. */
export function PressableScale({ style, onPressIn, onPressOut, disabled, ...rest }: PressableProps & { style?: StyleProp<ViewStyle> }) {
  const scale = useSharedValue(1);
  const reduce = useReducedMotion();
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      accessibilityRole={rest.accessibilityRole ?? 'button'}
      accessibilityState={{ disabled: !!disabled, ...rest.accessibilityState }}
      onPressIn={(e) => {
        if (!reduce) scale.value = withTiming(0.97, { duration: motion.press, easing: motion.easeOut });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, { duration: motion.press, easing: motion.easeOut });
        onPressOut?.(e);
      }}
      style={[style, animated]}
    />
  );
}
