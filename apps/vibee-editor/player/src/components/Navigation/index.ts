// TelegramTabBar is the single navigation surface. VerticalTabs and
// BottomNavigation are its two predecessors — both were dead code (exported
// here but rendered nowhere) and are superseded; they stay exported only so
// nothing that still references them breaks.
export { TelegramTabBar, TAB_BAR_ITEMS } from './TelegramTabBar';
export { VerticalTabs, TABS } from './VerticalTabs';
export { BottomNavigation } from './BottomNavigation';
