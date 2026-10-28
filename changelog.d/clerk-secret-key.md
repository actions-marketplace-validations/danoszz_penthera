section: Detection

- **Clerk secret keys, named as Clerk's.** Clerk's secret keys use the same
  `sk_live_` and `sk_test_` prefixes as Stripe's, so a leaked Clerk key was
  reported as a Stripe key, and a Clerk test key not at all. A key assigned to
  `CLERK_SECRET_KEY` (in `.env`, JSON or YAML) is now reported as a Clerk
  secret key: critical for a live key, high for a test key, which still opens
  the development instance and its users. Publishable keys (`pk_`) stay
  unreported. On the CredData dev half, precision and recall are unchanged.
