import { type ReactNode } from "react";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="max-w-3xl mx-auto px-6 bg-card rounded-xl shadow-lg py-12">
        <div className="prose prose-gray dark:prose-invert max-w-none">
          {children}
        </div>
      </div>
    </div>
  );
}
