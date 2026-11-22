import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { PressableScale } from './PressableScale';
import { color, space, type } from '../theme';

type Props = {
  title?: string;
  subtitle?: string;
  back?: boolean | (() => void);
  right?: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  children?: React.ReactNode;
  contentStyle?: ViewStyle;
};

export function BackButton({ onPress }: { onPress?: () => void }) {
  return (
    <PressableScale accessibilityLabel="Back" onPress={onPress ?? (() => router.back())} hitSlop={8} style={styles.back}>
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M15 5l-7 7 7 7" />
      </Svg>
    </PressableScale>
  );
}

/** Light screens outside the camera: off-white ground, one column, footer pinned to the bottom. */
export function Screen({ title, subtitle, back, right, footer, scroll = true, children, contentStyle }: Props) {
  const Body = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {(back || right) && (
          <View style={styles.bar}>
            {back ? <BackButton onPress={typeof back === 'function' ? back : undefined} /> : <View />}
            {right}
          </View>
        )}
        <Body
          style={styles.flex}
          contentContainerStyle={scroll ? [styles.content, contentStyle] : undefined}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!scroll ? <View style={[styles.content, styles.flex, contentStyle]}>{head(title, subtitle)}{children}</View> : (
            <>
              {head(title, subtitle)}
              {children}
            </>
          )}
        </Body>
        {footer && <View style={styles.footer}>{footer}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function head(title?: string, subtitle?: string) {
  if (!title) return null;
  return (
    <View style={styles.head}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, height: 52 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.xl, gap: space.xl },
  head: { gap: space.sm },
  title: { ...type.display, color: color.text },
  subtitle: { ...type.body, color: color.muted },
  footer: { paddingHorizontal: space.xl, paddingBottom: space.md, gap: space.sm },
});
