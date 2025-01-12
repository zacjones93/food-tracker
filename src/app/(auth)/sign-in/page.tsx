import { getSessionFromCookie } from "@/utils/auth";
import { redirect } from "next/navigation";
import SignInClientPage from "./sign-in.client";

const SignInPage = async () => {
  const session = await getSessionFromCookie();

  if (session) {
    return redirect('/');
  }

  return (
    <SignInClientPage />
  )
}

export default SignInPage;
