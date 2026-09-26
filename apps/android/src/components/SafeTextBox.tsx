import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { spacing, radius } from '../theme/spacing';

export function SafeTextBox({text}:{text:string}) {
  return <View style={styles.c}><Text style={styles.t} selectable>{text}</Text></View>;
}
const styles = StyleSheet.create({
  c:{backgroundColor:colors.surfaceAlt,borderRadius:radius.md,padding:spacing.md,borderWidth:1,borderColor:colors.border},
  t:{fontSize:13,fontFamily:'monospace',color:colors.textSecondary,lineHeight:20},
});
