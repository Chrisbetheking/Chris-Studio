import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { loadArchive } from '../storage/archiveStore';
import type { ArchiveEntry } from '@shared/types';
import { SENSITIVE_TYPE_LABELS } from '@shared/types';
import { RiskBadge } from '../components/RiskBadge';
import { SafeTextBox } from '../components/SafeTextBox';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

type Route = RouteProp<{ ArchiveDetail: { id: string } }, 'ArchiveDetail'>;

export function ArchiveDetailScreen() {
  const route = useRoute<Route>();
  const [entry, setEntry] = useState<ArchiveEntry|null>(null);
  useEffect(()=>{loadArchive().then(e=>setEntry(e.find(x=>x.id===route.params.id)||null));},[route.params.id]);
  if(!entry) return <View style={styles.empty}><Text style={styles.emptyT}>Entry not found</Text></View>;
  const {guardResult}=entry;
  return (
    <ScrollView style={styles.c}>
      <RiskBadge level={guardResult.riskLevel} count={guardResult.findings.length} />
      <Text style={styles.d}>{new Date(entry.savedAt).toLocaleString()}</Text>
      {guardResult.findings.length>0&&<View style={styles.sec}>{guardResult.findings.map((f,i)=><View key={i} style={styles.f}><Text style={styles.ft}>{SENSITIVE_TYPE_LABELS[f.type]}</Text><Text style={styles.fm}>{f.match}</Text></View>)}</View>}
      <Text style={styles.st}>Redacted Prompt</Text><SafeTextBox text={guardResult.redacted} />
      {guardResult.original?<><Text style={styles.st}>Original Prompt</Text><SafeTextBox text={guardResult.original} /></>:<Text style={styles.note}>Original prompt not stored (sanitized-only mode)</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c:{flex:1,backgroundColor:colors.background,padding:spacing.lg},
  empty:{flex:1,justifyContent:'center',alignItems:'center'},
  emptyT:{fontSize:17,color:colors.textSecondary},
  d:{fontSize:12,color:colors.textMuted,marginTop:8,marginBottom:spacing.lg},
  sec:{marginBottom:spacing.lg},
  st:{fontSize:16,fontWeight:'600',color:colors.text,marginBottom:8},
  f:{paddingVertical:4,borderBottomWidth:1,borderBottomColor:colors.border,marginBottom:4},
  ft:{fontSize:14,fontWeight:'600',color:colors.text},
  fm:{fontSize:12,fontFamily:'monospace',color:colors.textSecondary},
  note:{fontSize:13,color:colors.textMuted,fontStyle:'italic'},
});
