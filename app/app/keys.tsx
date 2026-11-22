import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '../src/ui/Screen';
import { Button } from '../src/ui/Button';
import { KeyCard } from '../src/ui/KeyCard';
import { useAccess } from '../src/state/access';
import { color, space, type } from '../src/theme';

export default function Keys() {
  const { owner } = useAccess();
  return (
    <Screen
      title="Your friend keys are ready"
      subtitle={`We also emailed them to ${owner?.email ?? 'you'}. Send one to each friend.`}
      footer={<Button title="Start scanning" onPress={() => router.replace('/scan')} />}
    >
      <View style={{ gap: space.md }}>
        {(owner?.slots ?? []).map((s) => <KeyCard key={s.slotNo} slot={s} />)}
      </View>
      <Text style={styles.note}>Each key works on one phone while your plan is active. See who's using them, or replace a key, in Settings.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { ...type.caption, color: color.muted },
});
