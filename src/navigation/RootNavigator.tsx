import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BuildHomeScreen } from '../modes/build';
import { KeepHomeScreen } from '../modes/keep';
import { colors } from '../theme';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

export function RootNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tab.Screen
        name="Keep"
        component={KeepHomeScreen}
        options={{ title: 'Keep', tabBarLabel: 'Keep' }}
      />
      <Tab.Screen
        name="Build"
        component={BuildHomeScreen}
        options={{ title: 'Build', tabBarLabel: 'Build' }}
      />
    </Tab.Navigator>
  );
}
