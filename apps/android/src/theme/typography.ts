import { Platform, TextStyle } from 'react-native';
const f = Platform.select({ android: 'monospace', default: 'System' });
export const typography: Record<string, TextStyle> = {
  h1: { fontSize: 24, fontWeight: '700', fontFamily: f },
  h2: { fontSize: 20, fontWeight: '600', fontFamily: f },
  h3: { fontSize: 17, fontWeight: '600', fontFamily: f },
  body: { fontSize: 15, fontWeight: '400', fontFamily: f },
  bodyBold: { fontSize: 15, fontWeight: '600', fontFamily: f },
  caption: { fontSize: 13, fontWeight: '400', fontFamily: f },
  small: { fontSize: 11, fontWeight: '400', fontFamily: f },
  mono: { fontSize: 14, fontFamily: 'monospace' },
};
