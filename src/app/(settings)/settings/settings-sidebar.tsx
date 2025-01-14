"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ScrollShadow } from '@nextui-org/react'
import {
  User,
  Smartphone,
  Lock,
  LogOut
} from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSessionStore } from "@/state/session";
import { signOutAction } from "@/actions/sign-out.action";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { useRef } from "react";

interface SidebarNavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const sidebarNavItems: SidebarNavItem[] = [
  {
    title: "Profile",
    href: "/settings",
    icon: User,
  },
  {
    title: "Sessions",
    href: "/settings/sessions",
    icon: Smartphone,
  },
  {
    title: "Change Password",
    href: "/forgot-password",
    icon: Lock,
  },
];

export function SettingsSidebar() {
  const pathname = usePathname();
  const isLgAndSmaller = useMediaQuery('LG_AND_SMALLER')
  const { clearSession } = useSessionStore();
  const dialogCloseRef = useRef<HTMLButtonElement>(null);

  const handleSignOut = () => {
    signOutAction().then(() => {
      setTimeout(() => {
        clearSession()
      }, 200)
    })
  };

  return (
    <ScrollShadow
      className="w-full lg:w-auto whitespace-nowrap pb-2"
      orientation="horizontal"
      isEnabled={isLgAndSmaller}
    >
      <nav className="flex items-center lg:items-stretch min-w-full space-x-2 pb-2 lg:pb-0 lg:flex-col lg:space-x-0 lg:space-y-1">
        {sidebarNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              pathname === item.href
                ? "bg-muted hover:bg-muted dark:text-foreground dark:hover:text-foreground/70"
                : "hover:bg-transparent",
              "justify-start hover:no-underline whitespace-nowrap"
            )}
          >
            <item.icon className="mr-2 h-4 w-4" />
            {item.title}
          </Link>
        ))}

        <Dialog>
          <DialogTrigger asChild>
            <button
              className={cn(
                buttonVariants({ variant: "destructive" }),
                "justify-start hover:no-underline whitespace-nowrap lg:mt-4"
              )}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sign out?</DialogTitle>
              <DialogDescription>
                Are you sure you want to sign out of your account?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <DialogClose ref={dialogCloseRef} asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                variant="destructive"
                onClick={() => {
                  handleSignOut();
                  dialogCloseRef.current?.click();
                }}
              >
                Sign out
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </nav>
    </ScrollShadow>
  );
}
