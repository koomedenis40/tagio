import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Path, Rect } from 'react-native-svg';
import { Screen } from '../src/ui/Screen';
import { Button } from '../src/ui/Button';
import { useAccess } from '../src/state/access';
import { errorMessage } from '../src/lib/api';
import { formatKeyInput, KEY_ALPHABET } from '../src/core/keys';
import { color, radius, space, type } from '../src/theme';

export default function Redeem() {
  const { redeem } = useAccess();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const body = value.replace(/^TAG-?/, '').replace(/-/g, '');
  const complete = body.length === 8;
  const badChars = [...body].some((c) => !KEY_ALPHABET.includes(c));
  const formatError = complete && badChars ? 'That doesn’t look like a Tagio key. Check for typos.' : null;

  const unlock = async () => {
    setBusy(true);
    setError(null);
    try {
      await redeem(value);
      router.replace('/scan');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const message = error ?? formatError;
  return (
    <Screen
      back
      title="Enter your friend key"
      subtitle="A friend with Tagio Share sent you a key. It works on this phone for as long as their plan is active."
      footer={
        <>
          <Button title="Unlock Tagio" onPress={unlock} loading={busy} disabled={!complete || badChars} />
          <Button title="No key? See plans" variant="text" onPress={() => router.replace('/plans')} />
        </>
      }
    >
      <View style={{ gap: space.sm }}>
        <Text style={styles.label} nativeID="key-label">Friend key</Text>
        <TextInput
          accessibilityLabelledBy="key-label"
          value={value}
          onChangeText={(t) => {
            setValue(formatKeyInput(t));
            setError(null);
          }}
          autoFocus
          autoCapitalize="characters"
          autoCorrect={false}
          spellCheck={false}
          placeholder="TAG-XXXX-XXXX"
          placeholderTextColor={color.disabled}
          returnKeyType="go"
          onSubmitEditing={() => complete && !badChars && unlock()}
          style={[styles.input, message && styles.inputError]}
        />
        <Text style={[styles.help, message && styles.helpError]} accessibilityLiveRegion="polite">
          {message ?? (complete ? 'Looks right. We’ll check it when you unlock.' : 'Keys look like TAG-7KQ2-M9PX.')}
        </Text>
      </View>
      <View style={styles.box}>
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color.black} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Rect x={4} y={11} width={16} height={10} rx={2} />
          <Path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </Svg>
        <Text style={styles.boxText}>No account and no email needed. Your friend can see that the key is in use, but never what you scan.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: color.muted },
  input: { height: 60, paddingHorizontal: 16, fontSize: 22, fontWeight: '600', letterSpacing: 1.5, color: color.black, backgroundColor: color.surface, borderWidth: 2, borderColor: color.black, borderRadius: radius.control },
  inputError: { borderColor: color.danger },
  help: { ...type.caption, color: color.muted },
  helpError: { color: color.danger },
  box: { flexDirection: 'row', gap: 12, padding: 16, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.card },
  boxText: { flex: 1, ...type.caption, color: color.body },
});
