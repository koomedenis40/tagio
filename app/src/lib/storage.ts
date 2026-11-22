import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

/** Plain settings and caches. Nothing here identifies a person. */
export const prefs = {
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await AsyncStorage.getItem(`tagio:${key}`);
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined;
    }
  },
  async set<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(`tagio:${key}`, JSON.stringify(value));
  },
  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(`tagio:${key}`);
  },
};

/** Tokens live in the Keychain / Keystore. */
export const secure = {
  get: (key: string) => SecureStore.getItemAsync(`tagio_${key}`),
  set: (key: string, value: string) => SecureStore.setItemAsync(`tagio_${key}`, value),
  remove: (key: string) => SecureStore.deleteItemAsync(`tagio_${key}`),
};

/** A random id for this install, used only to tie a friend key to one phone. */
export async function installId(): Promise<string> {
  const existing = await secure.get('install_id');
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await secure.set('install_id', id);
  return id;
}
