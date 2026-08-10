import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import {
  addConversationMember,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  removeConversationMember,
  toggleArchiveConversation,
  toggleMuteConversation,
  updateConversation,
} from '../controllers/conversationController.js';

const router = Router();

router.use(auth);

router.get('/', listConversations);
router.post('/', createConversation);
router.get('/:id', getConversation);
router.put('/:id', updateConversation);
router.delete('/:id', deleteConversation);
router.post('/:id/members', addConversationMember);
router.delete('/:id/members/:userId', removeConversationMember);
router.put('/:id/mute', toggleMuteConversation);
router.put('/:id/archive', toggleArchiveConversation);

export default router;
