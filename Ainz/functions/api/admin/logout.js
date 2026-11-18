import { handleAdminLogout, json } from '../../_admin_session.js';

// POST /api/admin/logout
export const onRequestPost = async (context) => {
  return await handleAdminLogout(context);
};
