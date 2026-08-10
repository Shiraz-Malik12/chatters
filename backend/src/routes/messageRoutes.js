import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import {
  createMessage,
  getConversationMessages,
  markConversationRead,
  reactToMessage,
  removeMessage,
  searchConversationMessages,
  updateMessage,
} from '../controllers/messageController.js';

const router = Router();

router.use(auth);

router.get('/conversation/:id', getConversationMessages);
router.post('/conversation/:id', createMessage);
router.put('/conversation/:id/read', markConversationRead);
router.put('/:id', updateMessage);
router.delete('/:id', removeMessage);
router.post('/:id/react', reactToMessage);
router.get('/search', searchConversationMessages);

export default router;
