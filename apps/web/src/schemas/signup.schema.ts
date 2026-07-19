import { z } from "zod"

export const signUpSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().min(2).max(255),
  lastName: z.string().trim().min(2).max(255),
  password: z.string().min(8).max(255),
})

export type SignUpSchema = z.infer<typeof signUpSchema>
