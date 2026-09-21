import { useEffect } from 'react';
import { SITE_URL } from './neon';

interface SeoProps {
  title?: string;
  description?: string;
  path?: string;
  image?: string | null;
  type?: 'website' | 'product' | 'article';
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noindex?: boolean;
}

const BRAND = 'Élaré Beauty';
const DEFAULT_DESCRIPTION = 'Discover Élaré Beauty — refined makeup designed to complement every complexion, mood, and moment.';

function setMeta(attr: 'name' | 'property', key: string, content: string | null | undefined) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!content) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Head manager: title, description, canonical, Open Graph, Twitter and JSON-LD.
 * Mount one per page. Cleans up on unmount so stale product schema never leaks
 * into the next route.
 */
export function Seo({ title, description, path, image, type = 'website', jsonLd, noindex }: SeoProps) {
  useEffect(() => {
    const fullTitle = title ? `${title} — ${BRAND}` : `${BRAND} — Beauty, defined by you.`;
    const desc = description ?? DEFAULT_DESCRIPTION;
    const url = SITE_URL + (path ?? window.location.pathname);
    document.title = fullTitle;
    setMeta('name', 'description', desc);
    setMeta('name', 'robots', noindex ? 'noindex,nofollow' : 'index,follow');
    setMeta('property', 'og:site_name', BRAND);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:type', type === 'product' ? 'product' : type);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', image ?? `${SITE_URL}/og-default.jpg`);
    setMeta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', desc);
    setMeta('name', 'twitter:image', image ?? null);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = url;

    const scripts: HTMLScriptElement[] = [];
    const blocks = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
    for (const block of blocks) {
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.dataset.seo = '1';
      s.text = JSON.stringify({ '@context': 'https://schema.org', ...block });
      document.head.appendChild(s);
      scripts.push(s);
    }
    return () => scripts.forEach((s) => s.remove());
  }, [title, description, path, image, type, noindex, JSON.stringify(jsonLd)]);
  return null;
}

export const organizationSchema = {
  '@type': 'Organization',
  name: BRAND,
  url: SITE_URL,
  logo: `${SITE_URL}/favicon.svg`,
  sameAs: [],
};

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: SITE_URL + it.path })),
  };
}
