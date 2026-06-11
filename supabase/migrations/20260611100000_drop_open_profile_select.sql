-- Drop the original open SELECT policy created in 20260506192947 that makes
-- all profiles readable regardless of submissions_public. The scoped policies
-- "Users read own profile" and "Public profiles readable" from
-- 20260611000000_final_security_hardening replace it.

DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
