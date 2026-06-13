import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, TextInput, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PROVIDERS } from '@shared/providers';
import { loadSettings, saveSettings } from '../storage/settingsStore';
import { clearArchive } from '../storage/archiveStore';
import type { AppSettings } from '@shared/types';
import { colors } from '../theme/colors';
import { spacing, radius } from '../theme/spacing';
import { tk, getLang, setLang, availableLanguages } from '@shared/i18n';
import type { SupportedLanguage } from '@shared/i18n';

type Nav = NativeStackNavigationProp<{ Storage: undefined }>;

export function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const [settings, setSettings] = useState<AppSettings>({localOnly:false,defaultProvider:'OpenAI',defaultModel:'gpt-4o',storeSanitizedOnly:true});
  const [pi, setPi] = useState(0);
  const [lang, setLangState] = useState<SupportedLanguage>(getLang());
  useEffect(()=>{loadSettings().then(loaded=>{setSettings(loaded);const i=PROVIDERS.findIndex(p=>p.provider===loaded.defaultProvider);if(i>=0)setPi(i);});},[]);

  const cycle = () => {const n=(pi+1)%PROVIDERS.length;setPi(n);setSettings({...settings,defaultProvider:PROVIDERS[n].provider,defaultModel:PROVIDERS[n].model});};
  const cycleLang = () => {
    const next = lang === 'en' ? 'zh-CN' : 'en';
    setLang(next);
    setLangState(next);
  };
  const langLabel = lang === 'en' ? 'English' : '中文';

  return (
    <ScrollView style={styles.c}>
      <Text style={styles.title}>{tk('android.settings')}</Text>

      {/* Language Switcher */}
      <View style={styles.row}>
        <View style={styles.rt}>
          <Text style={styles.rl}>{tk('language.switchTo')}</Text>
          <Text style={styles.rd}>{tk('language.english')} / {tk('language.chinese')}</Text>
        </View>
        <TouchableOpacity style={styles.langBtn} onPress={cycleLang}>
          <Text style={styles.langBtnT}>{langLabel}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.row}><View style={styles.rt}><Text style={styles.rl}>Local-Only Mode</Text><Text style={styles.rd}>Only use local models</Text></View>
        <Switch value={settings.localOnly} onValueChange={v=>setSettings({...settings,localOnly:v})} trackColor={{false:colors.border,true:colors.primaryLight}} thumbColor={settings.localOnly?colors.primary:colors.surfaceAlt} /></View>
      <View style={styles.f}><Text style={styles.fl}>Default Provider</Text>
        <TouchableOpacity style={styles.picker} onPress={cycle}><Text style={styles.pt}>{settings.defaultProvider} / {settings.defaultModel}</Text><Text style={styles.ph}>Tap to cycle</Text></TouchableOpacity></View>
      <View style={styles.f}><Text style={styles.fl}>Default Model</Text>
        <TextInput style={styles.input} value={settings.defaultModel} onChangeText={v=>setSettings({...settings,defaultModel:v})} placeholder="gpt-4o" placeholderTextColor={colors.textMuted} /></View>
      <View style={styles.row}><View style={styles.rt}><Text style={styles.rl}>Store Sanitized Only</Text><Text style={styles.rd}>Save only redacted prompts</Text></View>
        <Switch value={settings.storeSanitizedOnly} onValueChange={v=>setSettings({...settings,storeSanitizedOnly:v})} trackColor={{false:colors.border,true:colors.primaryLight}} thumbColor={settings.storeSanitizedOnly?colors.primary:colors.surfaceAlt} /></View>
      <TouchableOpacity style={styles.storageBtn} onPress={()=>navigation.navigate('Storage')}><Text style={styles.storageBtnT}>Storage & Export Paths</Text></TouchableOpacity>
      <TouchableOpacity style={styles.save} onPress={async()=>{await saveSettings(settings);Alert.alert(tk('actions.save'),'Settings saved.');}}><Text style={styles.saveT}>{tk('actions.save')} {tk('android.settings')}</Text></TouchableOpacity>
      <TouchableOpacity style={styles.danger} onPress={()=>Alert.alert('Clear Archive','Delete all locally saved runs?',[{text:'Cancel',style:'cancel'},{text:'Clear All',style:'destructive',onPress:async()=>{await clearArchive();Alert.alert('Cleared','Archive cleared.');}}])}><Text style={styles.dangerT}>Clear Archive</Text></TouchableOpacity>
      <View style={styles.about}><Text style={styles.aT}>{tk('app.title')} {tk('android.mobileLite')}</Text><Text style={styles.aV}>{tk('app.version')} 0.5.1</Text><Text style={styles.aD}>Lightweight Android console for scanning prompt risks, cleaning sensitive data, and saving sanitized local history.</Text></View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  c:{flex:1,backgroundColor:colors.background,padding:spacing.lg},
  title:{fontSize:24,fontWeight:'700',color:colors.text,marginBottom:spacing.xl},
  row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:spacing.md,borderBottomWidth:1,borderBottomColor:colors.border,marginBottom:spacing.lg},
  rt:{flex:1},
  rl:{fontSize:15,fontWeight:'600',color:colors.text},
  rd:{fontSize:12,color:colors.textMuted,marginTop:2},
  f:{marginBottom:spacing.lg},
  fl:{fontSize:13,fontWeight:'600',color:colors.textSecondary,marginBottom:4},
  input:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,fontSize:14,color:colors.text,backgroundColor:colors.surface},
  picker:{borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,backgroundColor:colors.surface,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  pt:{fontSize:14,color:colors.text,fontWeight:'500'},
  ph:{fontSize:11,color:colors.textMuted},
  storageBtn:{marginBottom:spacing.lg,paddingVertical:spacing.md},
  storageBtnT:{fontSize:14,color:colors.primary,fontWeight:'600'},
  save:{backgroundColor:colors.primary,paddingVertical:spacing.md,borderRadius:radius.md,alignItems:'center',marginBottom:spacing.md},
  saveT:{color:'#fff',fontSize:15,fontWeight:'600'},
  danger:{borderWidth:1,borderColor:colors.riskHigh,paddingVertical:spacing.md,borderRadius:radius.md,alignItems:'center',marginBottom:spacing.lg},
  dangerT:{color:colors.riskHigh,fontSize:15,fontWeight:'600'},
  about:{marginTop:spacing.xl,paddingTop:spacing.lg,borderTopWidth:1,borderTopColor:colors.border,alignItems:'center'},
  aT:{fontSize:16,fontWeight:'700',color:colors.text,marginBottom:4},
  aV:{fontSize:12,color:colors.textMuted,marginBottom:8},
  aD:{fontSize:12,color:colors.textMuted,textAlign:'center',lineHeight:18},
  langBtn:{backgroundColor:colors.primary,paddingHorizontal:16,paddingVertical:8,borderRadius:radius.md},
  langBtnT:{color:'#fff',fontSize:14,fontWeight:'600'},
});

