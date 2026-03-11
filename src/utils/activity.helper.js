import Activity from '../models/activity.js';

/**
 * Log an activity event.
 * Call this after any successful mutation in a controller.
 *
 * @param {Object} params
 * @param {'expense_added'|'expense_updated'|'settlement_made'|
 *          'member_added'|'member_removed'|'group_created'|
 *          'group_renamed'|'group_left'|'group_deleted'} params.type
 * @param {Object} params.actor  - req.user
 * @param {Object} params.group  - group document (needs _id, name)
 * @param {Object} [params.metadata] - extra info (amount, description, targetName etc)
 */
export const logActivity = async ({ type, actor, group, metadata = {} }) => {
  try {
    await Activity.create({
      type,
      actor: actor._id,
      group: group._id,
      actorName: actor.name,
      groupName: group.name,
      metadata,
    });
  } catch (err) {
    // Never let activity logging break the main flow
    console.error('[Activity] Failed to log:', err.message);
  }
};