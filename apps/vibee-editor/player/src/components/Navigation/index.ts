// TelegramTabBar — единственная навигационная поверхность приложения.
//
// Здесь же раньше переэкспортировались VerticalTabs и BottomNavigation, её
// предшественники. Оба не рендерились нигде, а строчка «оставлены на случай,
// если кто-то ещё на них ссылается» держала их живыми в дереве: ссылок не
// было ни одной, зато правки трижды попадали в мёртвые файлы. Удалены.
export { TelegramTabBar, TAB_BAR_ITEMS } from './TelegramTabBar';
export { RouteMemory, LaunchRedirect } from './RouteMemory';
