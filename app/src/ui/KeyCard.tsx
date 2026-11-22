import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button } from './Button';
import type { Slot } from '../lib/api';
import { color, radius } from '../theme';

export function shareKey(key: string) {
  return Share.share({
    message: `Here's a Tagio friend key: ${key}\n\nInstall Tagio, tap "I have a friend key" and enter it to convert price tags into your currency.`,
  });
}

export function KeyCard({ slot }: { slot: Slot }) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardLabel}>Friend key {slot.slotNo}</Text>
        <Text style={[styles.status, slot.inUse && styles.statusOn]}>{slot.inUse ? 'In use' : 'Not used yet'}</Text>
      </View>
      <View style={styles.keyBox} accessible accessibilityLabel={`Key ${slot.key.split('').join(' ')}`}>
        <Text style={styles.key} selectable>{slot.key}</Text>
      </View>
      <View style={styles.actions}>
        <Button
          title={copied ? 'Copied' : 'Copy'}
          variant="secondary"
          style={styles.action}
          onPress={async () => {
            await Clipboard.setStringAsync(slot.key);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
        />
        <Button title="Share" style={styles.action} onPress={() => shareKey(slot.key)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 18, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.card },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { fontSize: 13, fontWeight: '600', color: color.muted },
  status: { fontSize: 12, fontWeight: '600', color: color.body, backgroundColor: color.lineSoft, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.chip, overflow: 'hidden' },
  statusOn: { backgroundColor: color.green, color: color.black },
  keyBox: { height: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.black, borderRadius: radius.control },
  key: { fontSize: 24, fontWeight: '700', letterSpacing: 1.5, color: color.black, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, minHeight: 46 },
});
