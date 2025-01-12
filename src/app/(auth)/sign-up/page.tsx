import { getSessionFromCookie } from "@/utils/auth";
import SignUpClientComponent from "./sign-up.client";
import { redirect } from "next/navigation";

const SignUpPage = async () => {
  const session = await getSessionFromCookie();

  if (session) {
    return redirect('/');
  }

  return <SignUpClientComponent />
}

export default SignUpPage;
