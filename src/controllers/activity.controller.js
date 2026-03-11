import Group from '../models/group.js';
import Activity from '../models/activity.js';

// GET /api/activity?page=1&limit=30
export const getActivity = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const skip = (page - 1) * limit;

    const userGroups = await Group.find({ members: userId }).select('_id');
    const groupIds = userGroups.map((g) => g._id);

    const activities = await Activity.find({ group: { $in: groupIds } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actor', 'name')
      .lean();

    const total = await Activity.countDocuments({ group: { $in: groupIds } });

    res.json({
      activities,
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + activities.length < total,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};