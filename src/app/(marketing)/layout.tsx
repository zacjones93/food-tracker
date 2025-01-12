import { Footer } from "@/components/footer";
import { Navigation } from "@/components/navigation";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <main className="flex-1">{children}</main>
    </div>
  );
}
