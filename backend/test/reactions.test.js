import 'dotenv/config';
import { after, before, afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Conversation from '../src/models/Conversation.js';
import Message from '../src/models/Message.js';
import Attachment from '../src/models/Attachment.js';
import cloudinaryService from '../src/services/cloudinaryService.js';
import { signAccessToken } from '../src/services/token.service.js';
import { toggleReaction } from '../src/utils/reactionUtils.js';

// Runs against a real, disposable local MongoDB database — never the dev
// database from MONGODB_URI. Cloudinary is always mocked.
const TEST_DB_URI = 'mongodb://127.0.0.1:27017/chatters_test_reactions';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

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
    put: (url) => authorize(request(app).put(url)),
  };
};

const createPrivateConversation = async (userA, userB) =>
  Conversation.create({
    type: 'private',
    participants: [{ user: userA._id }, { user: userB._id }],
    createdBy: userA._id,
  });

const createGroupConversation = async (users, creator) =>
  Conversation.create({
    type: 'group',
    groupName: 'Test Group',
    participants: users.map((u) => ({ user: u._id, role: u._id.equals(creator._id) ? 'admin' : 'member' })),
    admins: [creator._id],
    createdBy: creator._id,
  });

/** Mocks cloudinaryService so no test ever calls the real Cloudinary API. */
const mockSuccessfulUploads = () => {
  let counter = 0;

  const uploadMock = mock.method(cloudinaryService, 'uploadImage', async (buffer) => {
    counter += 1;
    return {
      public_id: `test/mock-${Date.now()}-${counter}`,
      secure_url: `https://res.cloudinary.com/test/image/upload/mock-${counter}.png`,
      width: 1,
      height: 1,
      bytes: buffer.length,
      format: 'png',
    };
  });
  const deleteMock = mock.method(cloudinaryService, 'deleteImage', async () => ({ result: 'ok' }));

  return { uploadMock, deleteMock };
};

const sendImageMessage = async (sender, conversation, filename = 'photo.png') =>
  asUser(sender)
    .post(`/api/messages/conversation/${conversation._id}`)
    .field('content', '')
    .attach('images', TINY_PNG, { filename, contentType: 'image/png' });

before(async () => {
  await mongoose.connect(TEST_DB_URI);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

afterEach(() => {
  mock.reset();
});

// ---------------------------------------------------------------------------
// toggleReaction — pure unit tests, no DB involved.
// ---------------------------------------------------------------------------

test('toggleReaction: exclusive mode swaps a user off their previous emoji', () => {
  const start = [
    { emoji: '👍', users: ['alice'] },
    { emoji: '😂', users: ['bob'] },
  ];

  const next = toggleReaction(start, 'alice', '❤️', { exclusive: true });

  assert.deepEqual(
    next.sort((a, b) => a.emoji.localeCompare(b.emoji)),
    [
      { emoji: '❤️', users: ['alice'] },
      { emoji: '😂', users: ['bob'] },
    ].sort((a, b) => a.emoji.localeCompare(b.emoji))
  );
});

test('toggleReaction: exclusive mode still toggles off when re-picking the same emoji', () => {
  const start = [{ emoji: '👍', users: ['alice'] }];
  const next = toggleReaction(start, 'alice', '👍', { exclusive: true });
  assert.deepEqual(next, []);
});

test('toggleReaction: non-exclusive mode lets one user stack multiple different emojis', () => {
  const start = [{ emoji: '👍', users: ['alice'] }];
  const next = toggleReaction(start, 'alice', '❤️', { exclusive: false });

  assert.deepEqual(
    next.sort((a, b) => a.emoji.localeCompare(b.emoji)),
    [
      { emoji: '👍', users: ['alice'] },
      { emoji: '❤️', users: ['alice'] },
    ].sort((a, b) => a.emoji.localeCompare(b.emoji))
  );
});

// ---------------------------------------------------------------------------
// Message reactions over HTTP — private (exclusive) vs group (stacking).
// ---------------------------------------------------------------------------

test('private conversation: each person keeps their own single reaction, switching swaps it', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const sendResponse = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: 'hey' });
  const messageId = sendResponse.body.data._id;

  await asUser(alice).post(`/api/messages/${messageId}/react`).send({ emoji: '👍' });
  const afterBob = await asUser(bob).post(`/api/messages/${messageId}/react`).send({ emoji: '❤️' });

  const reactionsAfterBob = afterBob.body.data.reactions;
  assert.equal(reactionsAfterBob.length, 2, 'both people have a badge each');

  // Alice switches her reaction — her ❤️/👍 bucket should move, Bob's must survive.
  const afterAliceSwitch = await asUser(alice).post(`/api/messages/${messageId}/react`).send({ emoji: '😂' });
  const reactions = afterAliceSwitch.body.data.reactions;

  assert.equal(reactions.length, 2);
  assert.ok(!reactions.some((r) => r.emoji === '👍'), 'alice\'s old 👍 bucket is gone');
  const laugh = reactions.find((r) => r.emoji === '😂');
  const heart = reactions.find((r) => r.emoji === '❤️');
  assert.ok(laugh && laugh.users.some((id) => String(id) === String(alice._id)));
  assert.ok(heart && heart.users.some((id) => String(id) === String(bob._id)));
});

test('group conversation: a user can still stack multiple different emoji reactions', async () => {
  const [owner, memberA, memberB] = await Promise.all([createUser(), createUser(), createUser()]);
  const conversation = await createGroupConversation([owner, memberA, memberB], owner);
  const sendResponse = await asUser(owner)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: 'group message' });
  const messageId = sendResponse.body.data._id;

  await asUser(memberA).post(`/api/messages/${messageId}/react`).send({ emoji: '👍' });
  const response = await asUser(memberA).post(`/api/messages/${messageId}/react`).send({ emoji: '🔥' });

  const reactions = response.body.data.reactions;
  assert.equal(reactions.length, 2, 'group conversations keep the original stacking behavior');
  assert.ok(reactions.every((r) => r.users.some((id) => String(id) === String(memberA._id))));
});

// ---------------------------------------------------------------------------
// Per-attachment reactions.
// ---------------------------------------------------------------------------

test('reacting to a specific attachment does not affect the message-level reactions', async () => {
  mockSuccessfulUploads();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const sendResponse = await sendImageMessage(alice, conversation);
  const attachmentId = sendResponse.body.data.attachments[0]._id;

  const reactResponse = await asUser(bob)
    .post(`/api/messages/attachments/${attachmentId}/react`)
    .send({ emoji: '😮' });

  assert.equal(reactResponse.statusCode, 200);
  const [attachment] = reactResponse.body.data.attachments;
  assert.equal(attachment.reactions.length, 1);
  assert.equal(attachment.reactions[0].emoji, '😮');
  assert.deepEqual(reactResponse.body.data.reactions, [], 'the message itself was never reacted to');
});

test('multiple images in one message carry independent reactions', async () => {
  mockSuccessfulUploads();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const sendResponse = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .field('content', '')
    .attach('images', TINY_PNG, { filename: 'a.png', contentType: 'image/png' })
    .attach('images', TINY_PNG, { filename: 'b.png', contentType: 'image/png' });

  const [first, second] = sendResponse.body.data.attachments;

  await asUser(bob).post(`/api/messages/attachments/${first._id}/react`).send({ emoji: '👍' });
  const finalResponse = await asUser(alice)
    .post(`/api/messages/attachments/${second._id}/react`)
    .send({ emoji: '❤️' });

  const [updatedFirst, updatedSecond] = finalResponse.body.data.attachments;
  assert.equal(updatedFirst.reactions.length, 1);
  assert.equal(updatedFirst.reactions[0].emoji, '👍');
  assert.equal(updatedSecond.reactions.length, 1);
  assert.equal(updatedSecond.reactions[0].emoji, '❤️');
});

test('a non-member cannot react to an attachment', async () => {
  mockSuccessfulUploads();
  const [alice, bob, outsider] = await Promise.all([createUser(), createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const sendResponse = await sendImageMessage(alice, conversation);
  const attachmentId = sendResponse.body.data.attachments[0]._id;

  const response = await asUser(outsider)
    .post(`/api/messages/attachments/${attachmentId}/react`)
    .send({ emoji: '👍' });

  assert.equal(response.statusCode, 403);
});

// ---------------------------------------------------------------------------
// Editing a message's images (full replace).
// ---------------------------------------------------------------------------

test('editing a message can replace its images entirely, and the old ones are cleaned up', async () => {
  const { deleteMock } = mockSuccessfulUploads();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const sendResponse = await sendImageMessage(alice, conversation, 'old.png');
  const messageId = sendResponse.body.data._id;
  const oldAttachmentId = sendResponse.body.data.attachments[0]._id;

  const editResponse = await asUser(alice)
    .put(`/api/messages/${messageId}`)
    .field('content', 'updated caption')
    .attach('images', TINY_PNG, { filename: 'new.png', contentType: 'image/png' });

  assert.equal(editResponse.statusCode, 200);
  assert.equal(editResponse.body.data.content, 'updated caption');
  assert.equal(editResponse.body.data.isEdited, true);
  assert.equal(editResponse.body.data.attachments.length, 1);
  assert.notEqual(String(editResponse.body.data.attachments[0]._id), String(oldAttachmentId));

  // Old attachment record and its Cloudinary asset are both gone.
  assert.equal(await Attachment.findById(oldAttachmentId), null);
  assert.equal(deleteMock.mock.calls.length, 1);
});

test('editing only the text of an image message leaves its images untouched', async () => {
  mockSuccessfulUploads();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const sendResponse = await sendImageMessage(alice, conversation);
  const messageId = sendResponse.body.data._id;
  const attachmentId = sendResponse.body.data.attachments[0]._id;

  const editResponse = await asUser(alice).put(`/api/messages/${messageId}`).send({ content: 'just new text' });

  assert.equal(editResponse.statusCode, 200);
  assert.equal(editResponse.body.data.attachments.length, 1);
  assert.equal(String(editResponse.body.data.attachments[0]._id), String(attachmentId));
  assert.ok(await Attachment.findById(attachmentId), 'original attachment was not deleted');
});

test('only the sender can edit their message', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const sendResponse = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: 'mine' });

  const response = await asUser(bob)
    .put(`/api/messages/${sendResponse.body.data._id}`)
    .send({ content: 'not mine to change' });

  assert.equal(response.statusCode, 403);
});
