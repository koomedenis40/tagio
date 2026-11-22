import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useAccess } from '../src/state/access';
import { useSettings } from '../src/state/settings';
import { color } from '../src/theme';

/** Opens straight on the camera for anyone with access; first launch goes to Welcome. */
export default function Gate() {
  const { ready } = useSettings();
  const { access, hasAccess } = useAccess();
  if (!ready || access.kind === 'loading') return <View style={{ flex: 1, backgroundColor: color.black }} />;
  if (hasAccess) return <Redirect href="/scan" />;
  if (access.kind === 'none' && access.reason === 'never') return <Redirect href="/welcome" />;
  return <Redirect href="/scan" />;
}
