import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { Camera as OcrCamera, type Text as OcrText } from 'react-native-vision-camera-ocr-plus';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSettings } from '../src/state/settings';
import { useAccess } from '../src/state/access';
import { useRates, ratesAge } from '../src/lib/rates';
import { useTagReader } from '../src/scan/useTagReader';
import { ScanGuide } from '../src/scan/ScanGuide';
import { ConversionBar } from '../src/scan/ConversionBar';
import { CurrencySheet } from '../src/ui/CurrencySheet';
import { Glass } from '../src/ui/Glass';
import { PressableScale } from '../src/ui/PressableScale';
import { Button } from '../src/ui/Button';
import { localCurrencyFor } from '../src/core/currencies';
import { convert, formatAmount, formatMoney, rateLabel } from '../src/core/money';
import { color, radius, space, type } from '../src/theme';

// Where OCR looks, as a share of the frame. The guide on screen sits inside it.
// Kept at module level: the OCR camera rebuilds its pipeline whenever these change identity.
const OCR_OPTIONS = {
  language: 'latin',
  frameSkipThreshold: 5,
  scanRegion: { left: '6%', top: '26%', width: '88%', height: '30%' },
} as const;
// The OCR camera forwards every view prop to VisionCamera, but its types leave out `style`.
const fill = { style: StyleSheet.absoluteFill } as object;

export default function Scan() {
  const settings = useSettings();
  const { access, hasAccess } = useAccess();
  const rates = useRates();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const device = useCameraDevice('back');
  const { hasPermission, canRequestPermission, requestPermission } = useCameraPermission();
  const [focused, setFocused] = useState(true);
  const [foreground, setForeground] = useState(true);
  const [torch, setTorch] = useState(false);
  const [sheet, setSheet] = useState<null | 'from' | 'to'>(null);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(s === 'active'));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!settings.onboarded) settings.update({ onboarded: true });
  }, [settings]);

  const { reading, onText, rescan } = useTagReader({
    mode: settings.from,
    region: settings.region,
    last: settings.lastConfirmed,
    onConfident: (code) => {
      if (code !== settings.lastConfirmed) settings.update({ lastConfirmed: code });
    },
  });

  const accessRef = useRef(hasAccess);
  accessRef.current = hasAccess;
  const onOcr = useCallback((data: OcrText | string) => {
    if (accessRef.current && typeof data !== 'string') onText(data);
  }, [onText]);

  const locked = reading.phase === 'locked' && !!reading.price;
  const fromCode = reading.detection?.code ?? (settings.from !== 'auto' ? settings.from : settings.lastConfirmed ?? localCurrencyFor(settings.region) ?? 'USD');
  const toCode = settings.to;
  const amount = reading.price?.amount;
  const converted = amount !== undefined ? convert(amount, fromCode, toCode, rates) : undefined;
  const unsure = settings.from === 'auto' && reading.detection?.confidence === 'low';

  const extra = reading.extras[0];
  const extraConverted = extra ? convert(extra.amount, fromCode, toCode, rates) : undefined;
  const rate = rateLabel(fromCode, toCode, rates);

  const guideW = width * 0.72;
  const guideH = Math.min(150, height * 0.17);
  const pick = (code: string | 'auto') => {
    if (sheet === 'from') settings.update(code === 'auto' ? { from: 'auto' } : { from: code, lastConfirmed: code });
    else if (code !== 'auto') settings.update({ to: code });
    setSheet(null);
  };
  const local = localCurrencyFor(settings.region);
  const suggestions = useMemo(() => {
    const list: { code: string; note: string }[] = [];
    const add = (code: string | undefined | null, note: string) => {
      if (code && !list.some((s) => s.code === code)) list.push({ code, note });
    };
    if (sheet === 'from') {
      add(reading.detection?.code, 'Read on this tag');
      add(local, 'Used where you are now');
      add(toCode, 'Your currency');
    } else {
      add(toCode, 'Your currency');
      add(local, 'Used where you are now');
      add('USD', 'Popular');
      add('EUR', 'Popular');
    }
    return sheet === 'from' ? [{ code: 'auto' as const, note: 'Reads the currency on each tag' }, ...list] : list;
  }, [sheet, reading.detection?.code, local, toCode]);

  if (!hasPermission) {
    return (
      <View style={[styles.fill, styles.permission, { paddingTop: insets.top + 80, paddingBottom: insets.bottom + 24 }]}>
        <View style={{ gap: space.md }}>
          <Text style={styles.permTitle}>Tagio needs your camera to read price tags</Text>
          <Text style={styles.permBody}>Everything is read on your phone. Images are never saved or sent anywhere.</Text>
        </View>
        <Button
          title={canRequestPermission ? 'Allow camera' : 'Open Settings'}
          onPress={() => (canRequestPermission ? requestPermission() : Linking.openSettings())}
        />
      </View>
    );
  }

  const cameraOn = focused && foreground && !!device;
  const lapsedCopy = noAccessCopy(access);

  return (
    <View style={styles.fill}>
      {device ? (
        <OcrCamera
          {...fill}
          device={device}
          isActive={cameraOn}
          torchMode={torch ? 'on' : 'off'}
          mode="recognize"
          options={OCR_OPTIONS}
          callback={onOcr}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noCamera]}>
          <Text style={styles.permBody}>No camera found on this device.</Text>
        </View>
      )}

      {/* Tap the camera to read again */}
      <PressableScale accessibilityLabel="Scan again" onPress={rescan} style={styles.tapArea} />

      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <PressableScale onPress={() => setTorch((t) => !t)} accessibilityLabel={torch ? 'Turn torch off' : 'Turn torch on'}>
          <Glass style={[styles.round, torch && styles.roundOn]}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={torch ? color.black : color.white} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M13 2L4 14h7l-1 8 9-12h-7z" />
            </Svg>
          </Glass>
        </PressableScale>
        <Glass style={styles.status} accessibilityLiveRegion="polite">
          <View style={[styles.dot, { backgroundColor: locked ? color.green : '#A3A8B0' }]} />
          <Text style={styles.statusText}>{!hasAccess ? 'Paused' : locked ? 'Price locked' : 'Looking for a price'}</Text>
        </Glass>
        <PressableScale onPress={() => router.push('/settings')} accessibilityLabel="Settings">
          <Glass style={styles.round}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color.white} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <Circle cx={12} cy={12} r={3} />
              <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </Svg>
          </Glass>
        </PressableScale>
      </View>

      <View style={[styles.guideWrap, { top: height * 0.3 }]} pointerEvents="none">
        <ScanGuide
          locked={locked && hasAccess}
          width={guideW}
          height={guideH}
          label={locked && converted !== undefined && hasAccess ? formatMoney(converted, toCode, settings.rounding) : undefined}
        />
      </View>

      {hasAccess ? (
        <View style={[styles.bottom, { bottom: insets.bottom + 12 }]}>
          <ConversionBar
            dim={!locked}
            from={{ code: fromCode, label: settings.from === 'auto' ? (unsure ? 'FROM · CHECK' : 'FROM · AUTO') : 'FROM', amount: amount !== undefined ? formatAmount(amount, fromCode) : '—' }}
            to={{ code: toCode, label: 'TO', amount: converted !== undefined ? formatAmount(converted, toCode, settings.rounding) : '—' }}
            rateLine={`${rate ?? 'No rate for this pair yet'} · ${ratesAge(rates.updatedAt)}`}
            extra={extra && extraConverted !== undefined ? `Per unit ${formatMoney(extraConverted, toCode, settings.rounding)}` : undefined}
            onFrom={() => setSheet('from')}
            onTo={() => setSheet('to')}
          />
        </View>
      ) : (
        <View style={[styles.bottom, { bottom: insets.bottom + 12 }]}>
          <Glass style={styles.lapsed}>
            <Text style={styles.lapsedTitle}>{lapsedCopy.title}</Text>
            <Text style={styles.lapsedBody}>{lapsedCopy.body}</Text>
            <Button title="See plans" onPress={() => router.push('/plans')} />
            <Button title="Enter a friend key" variant="onDark" onPress={() => router.push('/redeem')} />
          </Glass>
        </View>
      )}

      <CurrencySheet
        open={sheet !== null}
        title={sheet === 'from' ? 'Convert from' : 'Convert to'}
        selected={sheet === 'from' ? settings.from : toCode}
        suggestions={suggestions}
        autoNote={reading.detection && settings.from === 'auto' ? `Reading ${reading.detection.code} from the tag` : undefined}
        onPick={pick}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

function noAccessCopy(access: ReturnType<typeof useAccess>['access']) {
  if (access.kind === 'none' && access.reason === 'key-replaced') {
    return { title: 'This friend key was replaced', body: 'Your friend replaced the key you were using. Ask them for the new one.' };
  }
  if (access.kind === 'none' && access.reason === 'key-offline') {
    return { title: 'Connect to keep using your friend key', body: 'Friend keys check in at least every 3 days. Connect to the internet and Tagio picks up again.' };
  }
  if (access.kind === 'none' && access.reason === 'key-paused') {
    return { title: 'Your friend’s plan is paused', body: 'The key starts working again when they renew. You can also get your own plan.' };
  }
  if (access.kind === 'none' && access.reason === 'lapsed') {
    return { title: 'Your access has ended', body: 'Renew to keep converting. If you have Share, your friend keys start working again too.' };
  }
  return { title: 'Choose a plan to start converting', body: 'Point at any price tag and see it in your currency.' };
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: color.black },
  noCamera: { alignItems: 'center', justifyContent: 'center' },
  tapArea: { position: 'absolute', left: 0, right: 0, top: 110, height: '45%' },
  top: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  roundOn: { backgroundColor: color.green },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingHorizontal: 14, borderRadius: radius.pill },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { color: '#F2F3F5', fontSize: 13, fontWeight: '500' },
  guideWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bottom: { position: 'absolute', left: space.md, right: space.md },
  lapsed: { borderRadius: radius.sheet, padding: space.xl, gap: space.md },
  lapsedTitle: { ...type.title, color: color.white },
  lapsedBody: { ...type.body, color: color.onGlassMuted },
  permission: { paddingHorizontal: space.xl, justifyContent: 'space-between' },
  permTitle: { ...type.display, color: color.white },
  permBody: { ...type.body, color: color.onGlassMuted },
});
