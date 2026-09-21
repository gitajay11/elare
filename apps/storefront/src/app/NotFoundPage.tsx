import { Seo, Button } from '@elare/ui';

export default function NotFound() {
  return (
    <div className="container-x grid min-h-[60vh] place-items-center py-20 text-center">
      <Seo title="Page not found" noindex />
      <div>
        <p className="eyebrow">404</p>
        <h1 className="mt-3 text-[2.6rem] sm:text-[3.4rem]">This page has slipped away.</h1>
        <p className="mt-3 text-ink-soft">The link may be old, or the product may no longer be available.</p>
        <div className="mt-8 flex justify-center gap-3"><Button to="/">Back home</Button><Button variant="outline" to="/shop">Shop all</Button></div>
      </div>
    </div>
  );
}
