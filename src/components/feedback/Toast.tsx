import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { useLayout } from '@/hooks/use-layout';
import { useTheme } from '@/theme/theme';

const VISIBLE_MS = 2200;
const FADE_MS = 250;

const ToastContext = createContext<(message: string) => void>(() => {});

/** `const toast = useToast(); toast('Patient registered')` */
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const { isWide } = useLayout();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [progress] = useState(() => new Animated.Value(0));
  const [timer] = useState<{ id?: ReturnType<typeof setTimeout> }>(() => ({}));
  const [motion] = useState({ reduced: false });

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      motion.reduced = reduced;
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduced) => {
      motion.reduced = reduced;
    });
    return () => {
      subscription.remove();
      clearTimeout(timer.id);
    };
  }, [motion, timer]);

  const show = useCallback(
    (text: string) => {
      const fade = (toValue: number) =>
        Animated.timing(progress, {
          toValue,
          duration: motion.reduced ? 0 : FADE_MS,
          useNativeDriver: Platform.OS !== 'web',
        }).start();

      clearTimeout(timer.id);
      setMessage(text);
      fade(1);
      timer.id = setTimeout(() => fade(0), VISIBLE_MS);
    },
    [progress, timer, motion],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <View style={[styles.host, { bottom: isWide ? 28 : 84 + insets.bottom }]}>
        <Animated.View
          role="status"
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            {
              backgroundColor: colors.ink,
              opacity: progress,
              transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
            },
          ]}
        >
          <AppText weight={600} color="bg">
            {message}
          </AppText>
        </Animated.View>
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  // Taps pass straight through so the toast never blocks what is underneath it.
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 9, pointerEvents: 'none' },
  toast: { maxWidth: '90%', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 18 },
});
