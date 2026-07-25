import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { loadArchive, deleteEntry } from '../storage/archiveStore';
import { RiskBadge } from '../components/RiskBadge';
import type { ArchiveEntry } from '@shared/types';
import { colors } from '../theme/colors';
import { spacing, radius } from '../theme/spacing';

type Nav = NativeStackNavigationProp<{ ArchiveDetail: { id: string } }>;

export function ArchiveScreen() {
  const navigation = useNavigation<Nav>();
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => { setRefreshing(true); setEntries(await loadArchive()); setRefreshing(false); }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const handleDelete = (id: string) => Alert.alert('Delete','Remove this run?',[
    {text:'Cancel',style:'cancel'},
    {text:'Delete',style:'destructive',onPress:async()=>{await deleteEntry(id);refresh();}}
  ]);

  const fmt = (ts:number)=>new Date(ts).toLocaleDateString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});

  if(!entries.length) return <View style={styles.empty}><Text style={styles.emptyT}>No archived runs yet</Text><Text style={styles.emptyS}>Scanned prompts will appear here</Text></View>;

  return <FlatList data={entries} keyExtractor={i=>i.id} refreshing={refreshing} onRefresh={refresh} contentContainerStyle={styles.list}
    renderItem={({item})=>(
      <TouchableOpacity style={styles.card} onPress={()=>navigation.navigate('ArchiveDetail',{id:item.id})} onLongPress={()=>handleDelete(item.id)}>
        <View style={styles.h}><RiskBadge level={item.guardResult.riskLevel} count={item.guardResult.findings.length} compact /><Text style={styles.d}>{fmt(item.savedAt)}</Text></View>
        <Text style={styles.p} numberOfLines={2}>{item.guardResult.original||item.guardResult.redacted}</Text>
      </TouchableOpacity>
    )} />;
}

const styles = StyleSheet.create({
  list:{padding:spacing.lg,backgroundColor:colors.background},
  card:{backgroundColor:colors.surface,borderRadius:radius.md,padding:spacing.lg,marginBottom:8,borderWidth:1,borderColor:colors.border},
  h:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8},
  d:{fontSize:12,color:colors.textMuted},
  p:{fontSize:14,color:colors.textSecondary},
  empty:{flex:1,justifyContent:'center',alignItems:'center',padding:32},
  emptyT:{fontSize:17,fontWeight:'600',color:colors.textSecondary},
  emptyS:{fontSize:14,color:colors.textMuted,marginTop:4},
});
