import { LegalScreen } from '@/components/settings/LegalScreen';
import { PRIVACY_POLICY } from '@/content/legal';

export default function PrivacyPolicyScreen() {
  return <LegalScreen doc={PRIVACY_POLICY} />;
}
