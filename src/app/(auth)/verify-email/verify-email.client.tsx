"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useRouter, useSearchParams } from "next/navigation";
import { verifyEmailAction } from "./verify-email.actions";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";

export default function VerifyEmailClientComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const { execute: verifyEmail } = useServerAction(verifyEmailAction, {
    onError: (error) => {
      toast.dismiss();
      toast.error(error.err?.message);
    },
    onStart: () => {
      toast.loading("Verifying your email...");
    },
    onSuccess: () => {
      toast.dismiss();
      toast.success("Email verified successfully");
      router.push("/dashboard");
    },
  });

  return (
    <div className="container mx-auto px-4 flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Verify Email</CardTitle>
          <CardDescription>
            Click the button below to verify your email address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            onClick={() => {
              if (token) {
                verifyEmail({ token });
              }
            }}
          >
            Verify Email
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
