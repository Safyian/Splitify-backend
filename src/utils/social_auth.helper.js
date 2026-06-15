import User from '../models/user.js';
import { hashContact } from './hash.helper.js';

/**
 * Resolve a verified social profile to a single User document, creating or
 * linking as needed. The caller (controller) issues the JWT exactly as the
 * email/phone logins do — this helper only owns account identity.
 *
 * Locked decisions:
 *   1. providerId already on a user  → that user (already linked).
 *   2. email matches a REAL user     → LINK the provider id onto it (keep the
 *                                       password and the other provider intact).
 *   3. emailHash matches a PLACEHOLDER → PROMOTE it in place (same field moves
 *                                       registration's promote path makes, so the
 *                                       _id — and all group/expense/friend history
 *                                       hanging off it — is preserved).
 *   4. otherwise                      → CREATE a fresh social user (no password).
 *
 * Apple hidden-relay edge case: when `email` is absent we skip every email-based
 * branch and match/create on providerId only — never producing a duplicate when
 * the providerId already exists.
 *
 * @param {object} profile
 * @param {'google'|'apple'} profile.provider
 * @param {string} profile.providerId
 * @param {string|null} profile.email
 * @param {string|null} profile.name
 * @param {boolean} [profile.emailVerified]
 * @returns {Promise<import('mongoose').Document>} the resolved User
 */
export const resolveSocialUser = async ({ provider, providerId, email, name, emailVerified = false }) => {
  if (!provider || !providerId) {
    throw new Error('Social profile missing provider or providerId');
  }

  const idField = provider === 'google' ? 'googleId' : 'appleId';
  const normalisedEmail = email ? email.toLowerCase().trim() : null;

  // 1 — Already linked: this provider id is on an account.
  const byProviderId = await User.findOne({ [idField]: providerId });
  if (byProviderId) return byProviderId;

  if (normalisedEmail) {
    const emailHash = hashContact(normalisedEmail);

    // 2 — Real account with this email → LINK (multi-method; keep password + other provider).
    const realUser = await User.findOne({
      isPlaceholder: { $ne: true },
      email: normalisedEmail,
    });
    if (realUser) {
      realUser[idField] = providerId;
      if (emailVerified) realUser.isVerified = true;
      await realUser.save();
      return realUser;
    }

    // 3 — Placeholder with this email → PROMOTE in place (preserve _id and history).
    const placeholder = await User.findOne({ isPlaceholder: true, emailHash });
    if (placeholder) {
      placeholder.name = name?.trim() || placeholder.name;
      placeholder.email = normalisedEmail;
      placeholder[idField] = providerId;
      placeholder.isPlaceholder = false;
      placeholder.isVerified = emailVerified;
      await placeholder.save();
      return placeholder;
    }
  }

  // 4 — No match (or no email at all, e.g. Apple hidden relay) → CREATE.
  const user = new User({
    name: name?.trim() || 'Splitify User',
    [idField]: providerId,
    ...(normalisedEmail ? { email: normalisedEmail } : {}),
    isVerified: !!normalisedEmail && emailVerified,
    // no password — pre-save hook skips hashing when password is absent
  });
  await user.save();
  return user;
};
