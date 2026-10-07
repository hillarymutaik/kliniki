import { LegalScreen } from '@/components/settings/LegalScreen';
import { TERMS_OF_USE } from '@/content/legal';

export default function TermsScreen() {
  return <LegalScreen doc={TERMS_OF_USE} />;
}
