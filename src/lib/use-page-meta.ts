import { useEffect } from 'react';

/** Обновляет title, description и OpenGraph-метаданные страницы */
export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    document.title = title;
    const setMeta = (selector: string, attr: string, value: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(selector);
      if (!el) {
        el = document.createElement('meta');
        if (selector.includes('property=')) {
          el.setAttribute('property', selector.replace(/meta\[property="(.+)"\]/, '$1'));
        } else {
          el.setAttribute('name', selector.replace(/meta\[name="(.+)"\]/, '$1'));
        }
        document.head.appendChild(el);
      }
      el.setAttribute(attr, value);
    };
    if (description) {
      setMeta('meta[name="description"]', 'content', description);
      setMeta('meta[property="og:description"]', 'content', description);
    }
    setMeta('meta[property="og:title"]', 'content', title);
  }, [title, description]);
}
