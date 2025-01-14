import { z } from "zod";

export const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)

export const catchaSchema = turnstileEnabled
  ? z.string().min(1, 'Please complete the captcha')
  : z.string().optional()
