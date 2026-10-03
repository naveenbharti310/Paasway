import { useRef, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { colors } from '../../../theme/colors';
import { tap } from '../../../services/haptics';
import Icon from '../../../components/Icon';

const TRIGGER = 56;
const MAX = 80;

interface Props {
  onReply: () => void;
  children: ReactNode;
}

// Slide a message sideways to reply, like WhatsApp and Instagram. Either
// direction works. A small arrow appears and the reply starts past TRIGGER.
export default function SwipeToReply({ onReply, children }: Props) {
  const x = useRef(new Animated.Value(0)).current;
  const fired = useRef(false);
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderGrant: () => { fired.current = false; },
    onPanResponderMove: (_e, g) => {
      x.setValue(Math.max(-MAX, Math.min(MAX, g.dx)));
      if (!fired.current && Math.abs(g.dx) >= TRIGGER) { fired.current = true; tap(); }
    },
    onPanResponderRelease: () => {
      if (fired.current) onReplyRef.current();
      Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 6 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: false }).start(),
    onPanResponderTerminationRequest: () => false,
  })).current;
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;

  const leftArrow = x.interpolate({ inputRange: [0, 16, TRIGGER], outputRange: [0, 0, 1], extrapolate: 'clamp' });
  const rightArrow = x.interpolate({ inputRange: [-TRIGGER, -16, 0], outputRange: [1, 0, 0], extrapolate: 'clamp' });
  return (
    <View style={styles.full}>
      <Animated.View pointerEvents="none" style={[styles.arrow, styles.left, { opacity: leftArrow }]}>
        <View style={styles.arrowCircle}><Icon name="reply" size={16} color={colors.gold} /></View>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.arrow, styles.right, { opacity: rightArrow }]}>
        <View style={styles.arrowCircle}><Icon name="reply" size={16} color={colors.gold} /></View>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  full: { alignSelf: 'stretch' },
  arrow: { position: 'absolute', top: 0, bottom: 0, width: 32, alignItems: 'center', justifyContent: 'center' },
  left: { left: 0 },
  right: { right: 0 },
  arrowCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accentBg, alignItems: 'center', justifyContent: 'center' },
});
