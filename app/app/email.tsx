import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../src/ui/Screen';
import { Button } from '../src/ui/Button';
import { useAccess } from '../src/state/access';
import { errorMessage } from '../src/lib/api';
import { color, radius, space, type } from '../src/theme';

export default function Email() {
  const { startEmail, access, owner } = useAccess();
  const [email, setEmail] = useState(owner?.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const share = access.kind === 'owner' && access.plan === 'share';
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await startEmail(email.trim());
      router.push({ pathname: '/code', params: { email: email.trim() } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      title={share ? 'Where should we send your friend keys?' : 'Add your email'}
      subtitle={share
        ? 'You can already scan on this phone. Add an email to get 2 keys to share with friends.'
        : 'Optional. Get receipts and a reminder before your plan renews.'}
      footer={
        <>
          <Button title="Send code" onPress={send} loading={busy} disabled={!valid} />
          <Button title="Skip for now" variant="text" onPress={() => router.replace('/scan')} />
        </>
      }
    >
      <View style={{ gap: space.sm }}>
        <Text style={styles.label} nativeID="email-label">Email</Text>
        <TextInput
          accessibilityLabelledBy="email-label"
          value={email}
          onChangeText={setEmail}
          autoFocus
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={() => valid && send()}
          placeholder="you@example.com"
          placeholderTextColor={color.muted}
          style={[styles.input, error && styles.inputError]}
        />
        {error ? <Text style={styles.error} accessibilityLiveRegion="assertive">{error}</Text> : null}
      </View>
      <View style={styles.box}>
        <Text style={styles.boxTitle}>We only email you about</Text>
        <View style={styles.grid}>
          {(share ? ['Your friend keys', 'Receipts', 'Renewal reminders', 'Key activity'] : ['Receipts', 'Renewal reminders']).map((t) => (
            <Text key={t} style={styles.item}>{t}</Text>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: color.muted },
  input: { height: 56, paddingHorizontal: 16, fontSize: 17, color: color.black, backgroundColor: color.surface, borderWidth: 2, borderColor: color.black, borderRadius: radius.control },
  inputError: { borderColor: color.danger },
  error: { ...type.caption, color: color.danger },
  box: { gap: space.md, padding: 18, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.card },
  boxTitle: { fontSize: 13, fontWeight: '600', color: color.black },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  item: { width: '50%', fontSize: 14, color: color.body },
});
