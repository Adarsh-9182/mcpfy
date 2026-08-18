import { getViewer } from "@/lib/session";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer)} />
      <main id="main" className="mx-auto max-w-[860px] px-6 py-14 lg:px-8">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
