import { Button, Seo } from '@elare/ui';

export default function NotFound() {
  return (
    <div className="grid min-h-[50vh] place-items-center py-20 text-center">
      <Seo title="Not found" noindex />
      <div>
        <p className="eyebrow">404</p>
        <h1 className="mt-3 text-[2.4rem]">Nothing here.</h1>
        <p className="mt-3 text-ink-soft">The record may have been deleted, or the link is wrong.</p>
        <div className="mt-8 flex justify-center gap-3"><Button to="/">Dashboard</Button></div>
      </div>
    </div>
  );
}
