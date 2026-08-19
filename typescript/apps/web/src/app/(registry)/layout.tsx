import { getViewer } from "@/lib/session";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

/**
 * The registry gets its own group because it needs a wider column than the
 * marketing pages. Prose reads best around 860px; a grid of listing cards at
 * that width is two columns and a lot of empty page.
 */
export default async function RegistryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await getViewer();
  return (
    <>
      <SiteHeader signedIn={Boolean(viewer)} />
      <main id="main" className="mx-auto max-w-[1180px] px-6 py-12 lg:px-8">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
