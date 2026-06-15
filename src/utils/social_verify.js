/**
 * Social token verification seam.
 *
 * These two functions are the ONLY place that knows how to turn a raw provider
 * id-token into a trusted profile. Everything downstream (resolveSocialUser, the
 * controllers) depends only on the returned profile shape — never on how the
 * token was verified. That means the real Google/Apple verification can drop in
 * here later without touching the resolver or the controllers.
 *
 * Returned profile contract (identical for both providers):
 *   {
 *     provider:      'google' | 'apple',
 *     providerId:    String,   // the stable subject id from the provider ('sub')
 *     email:         String | null,
 *     emailVerified: Boolean,
 *     name:          String | null,
 *   }
 *
 * ── MODES ──────────────────────────────────────────────────────────────────
 * mock  → trust a decoded test payload passed in as `idToken` (an object, not a
 *         real JWT string). Enabled when SOCIAL_VERIFY_MODE === 'mock' OR
 *         NODE_ENV !== 'production'. Lets the resolver be exercised end-to-end
 *         without real provider credentials.
 * real  → not configured yet: throws so we can never accidentally ship the stub
 *         to production as a no-op that trusts arbitrary input.
 *
 * ── MOCK PAYLOAD SHAPE (for curl / tests) ───────────────────────────────────
 *   POST /auth/google
 *   { "idToken": { "sub": "g-123", "email": "a@b.com", "email_verified": true, "name": "Ada" } }
 *
 *   POST /auth/apple
 *   { "idToken": { "sub": "a-123", "email": "a@b.com", "email_verified": true }, "name": "Ada" }
 *
 *   `sub` is required in mock mode (it becomes providerId). Apple's hidden-relay
 *   case is simulated by omitting `email`.
 */

const isMockMode = () =>
  process.env.SOCIAL_VERIFY_MODE === 'mock' ||
  process.env.NODE_ENV !== 'production';

/** Normalise a decoded payload (mock now, real JWT claims later) into our profile. */
const toProfile = (provider, claims, fallbackName) => {
  if (!claims || typeof claims !== 'object') {
    throw new Error('Invalid token payload');
  }
  const providerId = claims.sub ?? claims.providerId;
  if (!providerId) {
    throw new Error('Token payload missing subject (sub)');
  }
  const email = claims.email ? String(claims.email).toLowerCase().trim() : null;
  // Google: 'email_verified'. Apple: 'email_verified' (string or bool). Default false.
  const emailVerified =
    claims.email_verified === true ||
    claims.email_verified === 'true' ||
    claims.emailVerified === true;

  return {
    provider,
    providerId: String(providerId),
    email,
    emailVerified: !!email && emailVerified,
    name: claims.name ?? fallbackName ?? null,
  };
};

/**
 * Verify a Google id-token and return the trusted profile.
 * @param {string|object} idToken  real JWT string (later) or mock claims object (now)
 */
export const verifyGoogleToken = async (idToken) => {
  if (!isMockMode()) {
    // TODO(real impl): verify with google-auth-library —
    //   const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    //   const ticket = await client.verifyIdToken({
    //     idToken,
    //     audience: process.env.GOOGLE_CLIENT_ID,
    //   });
    //   const payload = ticket.getPayload();   // { sub, email, email_verified, name, ... }
    //   return toProfile('google', payload);
    throw new Error('Google verification not configured');
  }
  return toProfile('google', idToken);
};

/**
 * Verify an Apple id-token and return the trusted profile.
 * @param {string|object} idToken  real JWT string (later) or mock claims object (now)
 * @param {string} [name]          Apple only sends the name on the FIRST auth, in the
 *                                 request body — pass it through so we can persist it.
 */
export const verifyAppleToken = async (idToken, name) => {
  if (!isMockMode()) {
    // TODO(real impl): verify the JWT against Apple's JWKS —
    //   1. fetch https://appleid.apple.com/auth/keys (cache the JWKS)
    //   2. jwt.verify(idToken, matchingKey, { algorithms: ['RS256'] })
    //   3. assert payload.aud === process.env.APPLE_CLIENT_ID
    //   4. assert payload.iss === 'https://appleid.apple.com'
    //   return toProfile('apple', payload, name);
    throw new Error('Apple verification not configured');
  }
  return toProfile('apple', idToken, name);
};
