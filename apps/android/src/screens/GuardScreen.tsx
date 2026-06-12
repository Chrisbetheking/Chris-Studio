import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Share } from 'react-native';
import { Clipboard } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { scanPrompt } from '@shared/guard';
import { SENSITIVE_TYPE_LABELS } from '@shared/types';
import { saveEntry } from '../storage/archiveStore';
import { loadSettings } from '../storage/settingsStore';
import { RiskBadge } from '../components/RiskBadge';
import { SectionCard } from '../components/SectionCard';
import { SafeTextBox } from '../components/SafeTextBox';
import { colors } from '../theme/colors';
import { spacing, radius } from '../theme/spacing';

type Route = RouteProp<{ Guard: { prompt: string } }, 'Guard'>;

export function GuardScreen() {
  const route = useRoute<Route>();
  const [copied, setCopied] = useState(false);
  const result = useMemo(() => scanPrompt(route.params.prompt), [route.params.prompt]);

  const handleCopy = async () => {
    Clipboard.setString(result.redacted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    const settings = await loadSettings();
    await saveEntry({
      id: Date.now().toString(),
      guardResult: settings.storeSanitizedOnly ? { ...result, original: '' } : result,
      taskType: 'general',
      savedAt: Date.now(),
    });
    Alert.alert('Saved', 'Prompt saved to local archive.');
  };

  const handleShare = async () => { try { await Share.share({ message: result.redacted }); } catch {} };

  return (
    <ScrollView style={styles.c}>
      <RiskBadge level={result.riskLevel} count={result.findings.length} />
      {result.findings.length > 0 && (
        <SectionCard title="Detected Sensitive Data">
          {result.findings.map((f,i) => (
            <View key={i} style={styles.fItem}>
              <Text style={styles.fType}>{SENSITIVE_TYPE_LABELS[f.type]}</Text>
              <Text style={styles.fMatch} numberOfLines={1}>{f.match}</Text>
            </View>
          ))}
        </SectionCard>
      )}
      <SectionCard title="Redacted Prompt"><SafeTextBox text={result.redacted} /></SectionCard>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.aBtn} onPress={handleCopy}><Text style={styles.aBtnT}>{copied?'Copied!':'Copy Safe Prompt'}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.aBtn} onPress={handleSave}><Text style={styles.aBtnT}>Save to Archive</Text></TouchableOpacity>
        <TouchableOpacity style={styles.aBtn} onPress={handleShare}><Text style={styles.aBtnT}>Share</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c:{flex:1,backgroundColor:colors.background,padding:spacing.lg},
  fItem:{paddingVertical:8,borderBottomWidth:1,borderBottomColor:colors.border},
  fType:{fontSize:14,fontWeight:'600',color:colors.text,marginBottom:2},
  fMatch:{fontSize:12,fontFamily:'monospace',color:colors.textSecondary},
  actions:{marginTop:spacing.lg,gap:8},
  aBtn:{backgroundColor:colors.surface,borderRadius:radius.md,paddingVertical:spacing.md,alignItems:'center',borderWidth:1,borderColor:colors.border},
  aBtnT:{fontSize:15,fontWeight:'500',color:colors.primary},
});
