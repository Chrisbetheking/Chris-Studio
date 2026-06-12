# v0.5.1 â€?Android Startup Crash Fix

**Date**: 2026-06-12  
**Tag**: v0.5.1  
**Type**: Patch

## Fix

- Replaced deprecated Clipboard from eact-native with expo-clipboard in pps/android/src/screens/GuardScreen.tsx
- React Native 0.76 / Expo SDK 52 removed the built-in Clipboard module
- The deprecated import caused AppRegistry.registerComponent to never be called, resulting in "main" has not been registered crash at startup

## Changed Files

- pps/android/src/screens/GuardScreen.tsx: import { Clipboard } from 'react-native' -> import * as Clipboard from 'expo-clipboard', setString -> setStringAsync

## Validation

- 
pm run typecheck âœ?  
- 
pm run android:typecheck âœ?  
- 
px expo-doctor (18/18) âœ?  
- 
px expo prebuild --no-install --platform android âœ?