import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { FeedPanel } from '@/components/Panels/FeedPanel';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useSetAtom } from 'jotai';
import { loadFeedAtom } from '@/atoms';
import './Feed.css';

export function FeedPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const loadFeed = useSetAtom(loadFeedAtom);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadFeed(true);
    setIsRefreshing(false);
  }, [loadFeed]);

  /*
   * АДРЕС С УКАЗАНИЕМ ПОСТА ДОЛЖЕН ВЕСТИ К ПОСТУ.
   *
   * Кнопка «скопировать ссылку» без этого давала бы адрес, открывающий
   * просто ленту, — то есть обещание, которого никто не исполняет. Ищем
   * карточку по id и прокручиваем к ней, когда лента загрузилась.
   *
   * Не нашли — ничего не делаем и не показываем ошибку: пост мог быть удалён
   * автором, и «ролик не найден» на чужой ссылке пугает сильнее, чем просто
   * лента.
   */
  const [параметры] = useSearchParams();
  const искомый = параметры.get('post');
  const [неНайден, setНеНайден] = useState(false);
  useEffect(() => {
    if (!искомый) return;
    let попыток = 0;
    const таймер = window.setInterval(() => {
      const карточка = document.querySelector(`[data-feed-id="${искомый}"]`);
      if (карточка) {
        карточка.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.clearInterval(таймер);
      } else if (++попыток > 20) {
        window.clearInterval(таймер);
        /*
         * НЕ НАШЛИ — СКАЖЕМ, А НЕ ПРОМОЛЧИМ.
         *
         * Лента грузит по 20 записей, а их 47: больше половины ссылок вели
         * на первую страницу и оставляли человека у ЧУЖОГО ролика, ничего не
         * объясняя. Молчание тут хуже отказа — оно выглядит как «вот он».
         *
         * Отличить «удалён» от «не на этой странице» на клиенте нечем,
         * поэтому формулировка честно покрывает оба случая и предлагает
         * действие вместо приговора.
         */
        setНеНайден(true);
      }
    }, 250);
    return () => window.clearInterval(таймер);
  }, [искомый]);

  usePullToRefresh({
    containerRef,
    onRefresh: handleRefresh,
    isRefreshing,
  });

  return (
    <div className="feed-page">
      <Header />
      <main className="feed-main" ref={containerRef}>
        <section className="feed-content">
          <div className={`pull-indicator ${isRefreshing ? 'refreshing' : ''}`}>
            <div className="pull-spinner" />
          </div>
          {неНайден && (
            <div className="feed-notice" role="status">
              Этот ролик не найден на первой странице ленты — он мог уйти ниже
              или быть удалён автором. Прокрутите ленту или откройте её заново.
            </div>
          )}
          <FeedPanel fullscreen />
        </section>
      </main>
    </div>
  );
}

export default FeedPage;
