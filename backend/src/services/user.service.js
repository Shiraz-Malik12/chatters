import User from '../models/User.js';

const SEARCH_RESULT_LIMIT = 20;

const searchUsers = async ({ query, excludeUserId }) => {
  const normalizedQuery = typeof query === 'string' ? query.trim() : '';

  if (!normalizedQuery) {
    return [];
  }

  const regex = new RegExp(normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  return User.find({
    _id: { $ne: excludeUserId },
    $or: [{ name: regex }, { email: regex }],
  })
    .select('name email avatar status')
    .limit(SEARCH_RESULT_LIMIT);
};

export { searchUsers };
