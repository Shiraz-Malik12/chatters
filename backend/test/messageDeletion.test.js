import 'dotenv/config';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Conversation from '../src/models/Conversation.js';
import { signAccessToken } from '../src/services/token.service.js';

// Runs against a real, disposable local MongoDB database — never the dev
// database from MONGODB_URI.
const TEST_DB_URI = 'mongodb://127.0.0.1:27017/chatters_test_message_deletion';

let userCounter = 0;

const createUser = async (overrides = {}) => {
  userCounter += 1;
  return User.create({
    name: `Test User ${userCounter}`,
    email: `test.user.${userCounter}.${Date.now()}@example.com`,
    passwordHash: 'not-a-real-hash',
    ...overrides,
  });
};

const tokenFor = (user) => signAccessToken({ id: user._id.toString(), email: user.email, role: user.role });

const asUser = (user) => {
  const authorize = (req) => req.set('Authorization', `Bearer ${tokenFor(user)}`);
  return {
    post: (url) => authorize(request(app).post(url)),
    get: (url) => authorize(request(app).get(url)),
    delete: (url) => authorize(request(app).delete(url)),
  };
};

const createPrivateConversation = async (userA, userB) =>
  Conversation.create({
    type: 'private',
    participants: [{ user: userA._id }, { user: userB._id }],
    createdBy: userA._id,
  });

const sendTextMessage = async (sender, conversation, content) =>
  (await asUser(sender).post(`/api/messages/conversation/${conversation._id}`).send({ content })).body.data;

before(async () => {
  await mongoose.connect(TEST_DB_URI);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('"delete for me" hides the message only from the deleting user, leaving it visible to everyone else', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const message = await sendTextMessage(alice, conversation, 'hey bob');

  const deleteResponse = await asUser(alice).delete(`/api/messages/${message._id}`).send({ deleteFor: 'me' });
  assert.equal(deleteResponse.statusCode, 200);
  // The message content itself is untouched — only alice's deletedFor entry changed.
  assert.equal(deleteResponse.body.data.isDeleted, false);
  assert.equal(deleteResponse.body.data.content, 'hey bob');
  assert.ok(deleteResponse.body.data.deletedFor.some((id) => String(id) === String(alice._id)));

  const aliceHistory = await asUser(alice).get(`/api/messages/conversation/${conversation._id}`);
  assert.ok(
    !aliceHistory.body.data.messages.some((m) => m._id === String(message._id)),
    'alice deleted it for herself, so it must not appear in her history'
  );

  const bobHistory = await asUser(bob).get(`/api/messages/conversation/${conversation._id}`);
  assert.ok(
    bobHistory.body.data.messages.some((m) => m._id === String(message._id) && m.content === 'hey bob'),
    "bob never deleted it, so it must still be fully visible in his history"
  );
});

test('the recipient can also "delete for me" a message they did not send', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const message = await sendTextMessage(alice, conversation, 'from alice');

  const response = await asUser(bob).delete(`/api/messages/${message._id}`).send({ deleteFor: 'me' });

  assert.equal(response.statusCode, 200);
  assert.ok(response.body.data.deletedFor.some((id) => String(id) === String(bob._id)));

  const bobHistory = await asUser(bob).get(`/api/messages/conversation/${conversation._id}`);
  assert.ok(!bobHistory.body.data.messages.some((m) => m._id === String(message._id)));
});

test('"delete for everyone" wipes content for both participants', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const message = await sendTextMessage(alice, conversation, 'oops wrong chat');

  const response = await asUser(alice).delete(`/api/messages/${message._id}`).send({ deleteFor: 'everyone' });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.isDeleted, true);
  assert.equal(response.body.data.content, '');

  const bobHistory = await asUser(bob).get(`/api/messages/conversation/${conversation._id}`);
  const found = bobHistory.body.data.messages.find((m) => m._id === String(message._id));
  assert.ok(found, 'message stays in history, just marked deleted');
  assert.equal(found.isDeleted, true);
});

test('only the sender can "delete for everyone"', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const message = await sendTextMessage(alice, conversation, 'from alice');

  const response = await asUser(bob).delete(`/api/messages/${message._id}`).send({ deleteFor: 'everyone' });

  assert.equal(response.statusCode, 403);
});

test('a non-participant cannot delete a message either way', async () => {
  const [alice, bob, outsider] = await Promise.all([createUser(), createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const message = await sendTextMessage(alice, conversation, 'private chat');

  const response = await asUser(outsider).delete(`/api/messages/${message._id}`).send({ deleteFor: 'me' });

  assert.equal(response.statusCode, 403);
});
