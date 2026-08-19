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
const TEST_DB_URI = 'mongodb://127.0.0.1:27017/chatters_test_message_reply';

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

const sendTextMessage = async (sender, conversation, content, replyTo) =>
  (
    await asUser(sender)
      .post(`/api/messages/conversation/${conversation._id}`)
      .send({ content, ...(replyTo ? { replyTo } : {}) })
  ).body.data;

before(async () => {
  await mongoose.connect(TEST_DB_URI);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('sending a message with a valid replyTo persists it and returns it populated with the original sender', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const original = await sendTextMessage(alice, conversation, 'original message');

  const response = await asUser(bob)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: 'this is a reply', replyTo: original._id });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.replyTo._id, original._id);
  assert.equal(response.body.data.replyTo.content, 'original message');
  assert.equal(response.body.data.replyTo.sender.name, alice.name);
});

test('a message sent without replyTo has replyTo: null (backward compatible)', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const message = await sendTextMessage(alice, conversation, 'no reply here');

  assert.equal(message.replyTo, null);
});

test('GET conversation history returns the populated replyTo for a reply message', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const original = await sendTextMessage(alice, conversation, 'hey bob');
  await sendTextMessage(bob, conversation, 'hey alice', original._id);

  const history = await asUser(alice).get(`/api/messages/conversation/${conversation._id}`);
  const reply = history.body.data.messages.find((m) => m.content === 'hey alice');

  assert.ok(reply, 'expected the reply to appear in conversation history');
  assert.equal(reply.replyTo._id, original._id);
  assert.equal(reply.replyTo.sender.name, alice.name);
});

test('replying to a message from a different conversation is rejected', async () => {
  const [alice, bob, carol] = await Promise.all([createUser(), createUser(), createUser()]);
  const conversationA = await createPrivateConversation(alice, bob);
  const conversationB = await createPrivateConversation(alice, carol);
  const messageInA = await sendTextMessage(alice, conversationA, 'only in conversation A');

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversationB._id}`)
    .send({ content: 'trying to quote across conversations', replyTo: messageInA._id });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
});

test('replying to a non-existent message id is rejected with 404', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const missingId = new mongoose.Types.ObjectId().toString();

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: 'replying to nothing', replyTo: missingId });

  assert.equal(response.statusCode, 404);
});

test('a malformed replyTo id is rejected with 400', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: 'bad id', replyTo: 'not-an-object-id' });

  assert.equal(response.statusCode, 400);
});

test('replying to a since-deleted-for-everyone message still returns the quote, flagged as deleted', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const original = await sendTextMessage(alice, conversation, 'will be deleted');

  await asUser(alice).delete(`/api/messages/${original._id}`).send({ deleteFor: 'everyone' });

  const reply = await sendTextMessage(bob, conversation, 'replying anyway', original._id);

  assert.equal(reply.replyTo._id, original._id);
  assert.equal(reply.replyTo.isDeleted, true);
});
