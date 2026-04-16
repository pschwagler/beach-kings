import { Redirect } from 'expo-router';

/**
 * Root index — redirects to the tabs.
 * AuthContext route guard handles auth redirects.
 */
export default function Index(): React.ReactNode {
  return <Redirect href="/(tabs)/home" />;
}
