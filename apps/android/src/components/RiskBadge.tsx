import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { RiskLevel } from '@shared/types';
import { colors } from '../theme/colors';
import { spacing, radius } from '../theme/spacing';

const C: Record<RiskLevel,{bg:string;text:string;icon:string}> = {
  safe:{bg:'#dcfce7',text:colors.riskSafe,icon:'\u2705'},
  low:{bg:'#fef9c3',text:'#a16207',icon:'\u26A0'},
  medium:{bg:'#ffedd5',text:'#c2410c',icon:'\u26A0'},
  high:{bg:'#fecaca',text:colors.riskHigh,icon:'\u274C'},
};

export function RiskBadge({level,count,compact}:{level:RiskLevel;count?:number;compact?:boolean}) {
  const c=C[level];
  if(compact) return <View style={[cs.cmp,{backgroundColor:c.bg}]}><Text style={{color:c.text,fontSize:12,fontWeight:'600'}}>{c.icon} {level.charAt(0).toUpperCase()+level.slice(1)}</Text></View>;
  return (
    <View style={[cs.ct,{backgroundColor:c.bg,borderColor:c.text}]}>
      <Text style={cs.ic}>{c.icon}</Text>
      <View><Text style={[cs.lb,{color:c.text}]}>{level.charAt(0).toUpperCase()+level.slice(1)} Risk</Text>
      {count!==undefined&&<Text style={[cs.cn,{color:c.text}]}>{count} sensitive {count===1?'item':'items'} detected</Text>}</View>
    </View>
  );
}
const cs = StyleSheet.create({
  ct:{flexDirection:'row',alignItems:'center',gap:spacing.md,padding:spacing.lg,borderRadius:radius.md,borderWidth:1},
  cmp:{flexDirection:'row',alignItems:'center',paddingHorizontal:8,paddingVertical:4,borderRadius:radius.sm},
  ic:{fontSize:24},
  lb:{fontSize:16,fontWeight:'700'},
  cn:{fontSize:13,marginTop:2},
});
