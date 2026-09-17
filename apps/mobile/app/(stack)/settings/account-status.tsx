import AccountModerationScreen from '@/components/screens/Settings/AccountModerationScreen';
import { useLocalSearchParams } from 'expo-router';

export default function AccountStatusRoute() {
  const { warningId, notificationId } = useLocalSearchParams<{
    warningId?: string;
    notificationId?: string;
  }>();
  return <AccountModerationScreen warningId={warningId} notificationId={notificationId} />;
}
