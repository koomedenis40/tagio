import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '../src/ui/Screen';
import { Button } from '../src/ui/Button';
import { useAccess } from '../src/state/access';
import { errorMessage } from '../src/lib/api';
import { color, radius, space, type } from '../src/theme';

export default function Code() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const { verifyEmail, startEmail } = useAccess();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const verify = async (value = code) => {
    setBusy(true);
    setError(null);
    try {
      const access = await verifyEmail(value);
      router.replace(access.plan === 'share' && access.slots.length > 0 ? '/keys' : '/scan');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!email) return;
    try {
      await startEmail(email);
      setResent(true);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen
      back
      title="Check your inbox"
      subtitle={`Enter the 6-digit code we sent to ${email ?? 'your email'}.`}
      footer={<Button title="Confirm email" onPress={() => verify()} loading={busy} disabled={code.length !== 6} />}
    >
      <View style={{ gap: space.sm }}>
        <Text style={styles.label} nativeID="code-label">Code</Text>
        <TextInput
          accessibilityLabelledBy="code-label"
          value={code}
          onChangeText={(t) => {
            const digits = t.replace(/\D/g, '').slice(0, 6);
            setCode(digits);
            if (digits.length === 6) verify(digits);
          }}
          autoFocus
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          placeholderTextColor={color.disabled}
          style={[styles.input, error && styles.inputError]}
        />
        {error ? <Text style={styles.error} accessibilityLiveRegion="assertive">{error}</Text> : null}
      </View>
      <Button title={resent ? 'Code sent again' : 'Resend code'} variant="text" onPress={resend} disabled={resent} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: color.muted },
  input: { height: 72, paddingHorizontal: 20, fontSize: 34, fontWeight: '600', letterSpacing: 16, color: color.black, backgroundColor: color.surface, borderWidth: 2, borderColor: color.black, borderRadius: radius.control, fontVariant: ['tabular-nums'] },
  inputError: { borderColor: color.danger },
  error: { ...type.caption, color: color.danger },
});
