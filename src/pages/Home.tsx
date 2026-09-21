import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Seo, organizationSchema } from '@/lib/seo';
import { SITE_URL } from '@/lib/neon';
import { useRecent } from '@/store/recent';
import { Hero } from '@/components/home/Hero';
import { SignatureCollection, RailSection, ShopByCategory, Editorial, BoughtTogether, ReviewsSection, LoyaltySection, RecentlyViewed } from '@/components/home/Sections';
import { Newsletter } from '@/components/layout/Footer';
import { ProductCardSkeleton } from '@/components/product/ProductCard';

export default function Home() {
  const { data, isLoading } = useQuery({ queryKey: ['home'], queryFn: api.home, staleTime: 60_000 });
  const recentIds = useRecent((s) => s.ids);
  const { data: recent } = useQuery({ queryKey: ['cards', recentIds], queryFn: () => api.productCards(recentIds), enabled: recentIds.length > 1 });

  const ring = data ? [...data.signature, ...data.best_sellers, ...data.new_arrivals].filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i) : [];

  return (
    <>
      <Seo
        path="/"
        jsonLd={[organizationSchema, { '@type': 'WebSite', name: 'Élaré Beauty', url: SITE_URL, potentialAction: { '@type': 'SearchAction', target: `${SITE_URL}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' } }]}
      />
      <Hero ringProducts={ring} />
      {isLoading || !data ? (
        <div className="container-x grid grid-cols-2 gap-6 py-20 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <ProductCardSkeleton key={i} />)}</div>
      ) : (
        <>
          <SignatureCollection products={data.signature} />
          <RailSection id="best-sellers-heading" tone="blush" eyebrow="Best sellers" title="Loved by the Élaré community." description="Ranked by real purchases." products={data.best_sellers} to="/best-sellers" toLabel="All best sellers" />
          <ShopByCategory categories={data.categories} />
          <Editorial />
          <RailSection id="new-heading" eyebrow="New arrivals" title="Just landed." products={data.new_arrivals} to="/shop?sort=newest" toLabel="See what’s new" />
          <BoughtTogether pairs={data.bought_together} />
          <ReviewsSection reviews={data.reviews} summary={data.review_summary} />
          <LoyaltySection />
          {recent && <RecentlyViewed products={recent} />}
          <Newsletter />
        </>
      )}
    </>
  );
}
