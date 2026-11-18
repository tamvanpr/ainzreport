import { getValidSession, json } from '../../_admin_session.js';

// GET /api/admin/me  -> cek apakah sesi admin valid (200) atau tidak (401)
export const onRequestGet = async (context) => {
  const session = await getValidSession(context);
  if (!session) {
    return json({ authed: false, message: 'Belum masuk.' }, 401);
  }
  return json({ authed: true });
};
