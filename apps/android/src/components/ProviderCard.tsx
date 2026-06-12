import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ProviderModel } from '@shared/types';
import { colors } from '../theme/colors';
import { spacing, radius } from '../theme/spacing';

export function ProviderCard({model}:{model:ProviderModel}) {
  const local = model.deployment==='local';
  return (
    <View style={styles.c}>
      <View style={styles.h}><View><Text style={styles.p}>{model.provider}</Text><Text style={styles.m}>{model.model}</Text></View>
        <View style={[styles.b,local?styles.bl:styles.bc]}><Text style={[styles.bt,local?styles.blt:styles.bct]}>{local?'Local':'Cloud'}</Text></View></View>
      <View style={styles.d}><Text style={styles.dl}>Best for</Text><Text style={styles.dv}>{model.bestFor}</Text></View>
      <View style={styles.d}><Text style={styles.dl}>Risk policy</Text><Text style={styles.dv}>{model.riskPolicy}</Text></View>
    </View>
  );
}
const styles = StyleSheet.create({
  c:{backgroundColor:colors.surface,borderRadius:radius.md,padding:spacing.lg,borderWidth:1,borderColor:colors.border},
  h:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12},
  p:{fontSize:16,fontWeight:'700',color:colors.text},
  m:{fontSize:12,fontFamily:'monospace',color:colors.textMuted,marginTop:2},
  b:{paddingHorizontal:8,paddingVertical:2,borderRadius:radius.sm},
  bl:{backgroundColor:'#dcfce7'},bc:{backgroundColor:'#dbeafe'},
  bt:{fontSize:11,fontWeight:'600'},
  blt:{color:'#166534'},bct:{color:'#1e40af'},
  d:{marginTop:8},
  dl:{fontSize:11,fontWeight:'600',color:colors.textMuted,textTransform:'uppercase'},
  dv:{fontSize:13,color:colors.textSecondary,marginTop:2},
});
