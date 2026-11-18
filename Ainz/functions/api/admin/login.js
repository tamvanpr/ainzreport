import { handleAdminLogin, handleAdminLogout, getValidSession } from '../../_admin_session.js';

// POST /api/admin/login
export const onRequestPost = async (context) => {
  return await handleAdminLogin(context);
};
