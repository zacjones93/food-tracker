import Link from "next/link";
import ThemeSwitch from "@/components/theme-switch";
import { SITE_NAME } from "@/constants";

export function Footer() {
  return (
    <footer className="border-t dark:bg-muted/30 bg-muted/60 shadow">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="py-6 md:py-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-6">
            <div className="space-y-3 md:space-y-4 flex flex-col items-center md:items-start">
              <h3 className="text-sm font-semibold text-foreground text-center md:text-left">Legal</h3>
              <ul className="space-y-2 flex flex-col items-center md:items-start">
                <li>
                  <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground text-center md:text-left">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground text-center md:text-left">
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>

            <div className="space-y-3 md:space-y-4 flex flex-col items-center md:items-start">
              <h3 className="text-sm font-semibold text-foreground text-center md:text-left">Help</h3>
              <ul className="space-y-2 flex flex-col items-center md:items-start">
                <li>
                  <Link href="/support" className="text-sm text-muted-foreground hover:text-foreground text-center md:text-left">
                    Support
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6 pt-6 md:mt-8 md:pt-8 border-t">
            <div className="flex flex-col items-center gap-6 md:flex-row md:justify-between md:gap-4">
              <p className="text-sm text-muted-foreground text-center md:text-left">
                © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
              </p>

              <ThemeSwitch />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
