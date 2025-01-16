import { useSessionStore } from "@/state/session";
import { signOutAction } from "@/actions/sign-out.action";


const useSignOut = () => {
  const { clearSession } = useSessionStore();

  const signOut = () => {
    signOutAction().then(() => {
      setTimeout(() => {
        clearSession()
      }, 200)
    })
  }

  return { signOut }
}

export default useSignOut;
