import Link from "next/link";
import { Wordmark } from "@/components/marketing/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-base">
      <header className="border-b border-line">
        <div className="mx-auto flex h-15 max-w-[1240px] items-center px-6 lg:px-8">
          <Link href="/" aria-label="MCPfy home">
            <Wordmark />
          </Link>
        </div>
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
