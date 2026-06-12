import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';

const Tab = createBottomTabNavigator();

function Home() { return <View style={s.c}><Text style={s.t}>Home</Text></View>; }
function Guard() { return <View style={s.c}><Text style={s.t}>Guard</Text></View>; }

const s = StyleSheet.create({ c: { flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#fff' }, t: { fontSize:24, fontWeight:'700', color:'#3b82f6' } });

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Tab.Navigator>
        <Tab.Screen name="Home" component={Home} />
        <Tab.Screen name="Guard" component={Guard} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}