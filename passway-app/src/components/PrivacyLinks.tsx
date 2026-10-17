import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import Button from './Button';
import { openPublicDocument, type PublicDocument } from '../services/publicDocuments';
import { colors } from '../theme/colors';

export default function PrivacyLinks() {
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [opening, setOpening] = useState<PublicDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function open(document: PublicDocument) {
    if (inFlight.current) return;
    inFlight.current = true;
    setOpening(document);
    setError(null);
    try {
      const result = await openPublicDocument(document, url => Linking.openURL(url));
      if (mounted.current && !result.opened) setError(result.message);
    } finally {
      inFlight.current = false;
      if (mounted.current) setOpening(null);
    }
  }

  return <View style={styles.container}>
    <Button label="Passway use rules" variant="ghost" testID="use-rules" loading={opening === 'rules'} disabled={opening !== null} onPress={() => open('rules')} />
    <Button label="Privacy notice" variant="ghost" testID="privacy-notice" loading={opening === 'privacy'} disabled={opening !== null} onPress={() => open('privacy')} />
    <Button label="Account deletion information" variant="ghost" testID="deletion-information" loading={opening === 'deletion'} disabled={opening !== null} onPress={() => open('deletion')} />
    {error && <Text selectable accessibilityRole="alert" style={styles.error} testID="public-document-error">{error}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: 8 },
  error: { fontFamily: 'Passway-Regular', fontSize: 14, lineHeight: 20, color: colors.danger },
});
