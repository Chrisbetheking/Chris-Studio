import React, { type ReactNode, type ErrorInfo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };
  static getDerivedStateFromError(e: Error) { return { hasError: true, error: e }; }
  componentDidCatch(e: Error, info: ErrorInfo) { console.error('ErrorBoundary caught:', e, info); }
  render() {
    if (this.state.hasError) {
      return (
        <View style={s.c}>
          <Text style={s.icon}>??</Text>
          <Text style={s.t}>Something went wrong</Text>
          <Text style={s.err}>{this.state.error?.message || 'Unknown error'}</Text>
          <TouchableOpacity style={s.btn} onPress={() => this.setState({ hasError: false, error: null })}>
            <Text style={s.btnT}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
const s = StyleSheet.create({
  c: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 24 },
  icon: { fontSize: 48, marginBottom: 12 },
  t: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  err: { fontSize: 13, color: '#ef4444', textAlign: 'center', marginBottom: 16 },
  btn: { backgroundColor: '#3b82f6', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  btnT: { color: '#fff', fontWeight: '600', fontSize: 14 },
});