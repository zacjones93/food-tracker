"use client";

import { signInAction } from "./sign-in.actions";
import { type SignInSchema, signInSchema } from "@/schemas/signin.schema";

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useServerAction } from "zsa-react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SignInPage = () => {
  const router = useRouter();
  const { execute: signIn, error } = useServerAction(signInAction)
  const form = useForm<SignInSchema>({
    resolver: zodResolver(signInSchema),
  });

  useEffect(() => {
    toast.dismiss()

    if (error) {
      toast.error(error.message)
    }
  }, [error]);

  const onSubmit = async (data: SignInSchema) => {
    toast.promise(signIn(data), {
      loading: "Signing you in...",
      success: "Signed in successfully",
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 p-10 bg-card rounded-xl shadow-lg border border-border">
        <div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-foreground">
            Sign in to your account
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Or{" "}
            <Link href="/sign-up" className="font-medium text-primary hover:text-primary/90">
              create a new account
            </Link>
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-6">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Email address</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      className="w-full px-3 py-2"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      className="w-full px-3 py-2"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full flex justify-center py-2.5"
            >
              Sign In
            </Button>
          </form>
        </Form>

        <div className="mt-6">
          <p className="text-center text-sm text-muted-foreground">
            <a href="/forgot-password" className="font-medium text-primary hover:text-primary/90">
              Forgot your password?
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignInPage;
